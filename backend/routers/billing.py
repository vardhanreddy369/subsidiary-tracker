"""Billing router — Stripe checkout, webhooks, portal."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.config import (
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_PRO,
    STRIPE_PRICE_ENTERPRISE,
    APP_URL,
)
from backend.auth import require_auth
from backend.database import get_db

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _get_stripe():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


@router.post("/create-checkout-session")
def create_checkout(request: Request, plan: str = "pro"):
    user = require_auth(request)
    stripe = _get_stripe()

    price_id = STRIPE_PRICE_PRO if plan == "pro" else STRIPE_PRICE_ENTERPRISE
    if not price_id:
        raise HTTPException(status_code=400, detail="Price not configured for this plan")

    session = stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        customer_email=user["email"],
        client_reference_id=str(user["id"]),
        success_url=APP_URL + "/#billing?success=true",
        cancel_url=APP_URL + "/#pricing?cancelled=true",
        metadata={"user_id": str(user["id"]), "plan": plan},
    )

    return {"url": session.url, "session_id": session.id}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    stripe = _get_stripe()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        # Return 200 to prevent timing/probing attacks
        return {"status": "ok"}

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data)

    return {"status": "ok"}


@router.get("/portal")
def billing_portal(request: Request):
    user = require_auth(request)
    stripe = _get_stripe()

    if not user.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=user["stripe_customer_id"],
        return_url=APP_URL + "/#billing",
    )
    return {"url": session.url}


@router.get("/status")
def billing_status(request: Request):
    user = require_auth(request)
    return {
        "plan": user["plan"],
        "stripe_customer_id": user.get("stripe_customer_id"),
        "has_subscription": bool(user.get("stripe_subscription_id")),
    }


def _handle_checkout_completed(session):
    user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
    plan = session.get("metadata", {}).get("plan", "pro")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    if not user_id:
        return

    with get_db() as conn:
        conn.execute(
            """UPDATE users SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?
               WHERE id = ?""",
            (plan, customer_id, subscription_id, int(user_id)),
        )


def _handle_subscription_updated(subscription):
    customer_id = subscription.get("customer")
    if not customer_id:
        return

    # Determine plan from price
    items = subscription.get("items", {}).get("data", [])
    price_id = items[0]["price"]["id"] if items else ""

    plan = "free"
    if price_id == STRIPE_PRICE_PRO:
        plan = "pro"
    elif price_id == STRIPE_PRICE_ENTERPRISE:
        plan = "enterprise"

    with get_db() as conn:
        conn.execute(
            "UPDATE users SET plan = ? WHERE stripe_customer_id = ?",
            (plan, customer_id),
        )


def _handle_subscription_deleted(subscription):
    customer_id = subscription.get("customer")
    if not customer_id:
        return

    with get_db() as conn:
        conn.execute(
            """UPDATE users SET plan = 'free', stripe_subscription_id = NULL
               WHERE stripe_customer_id = ?""",
            (customer_id,),
        )
