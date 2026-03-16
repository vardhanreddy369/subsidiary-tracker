/* === Tech Stack & Skills Page — Premium UI === */

function renderTechStack() {
    app.innerHTML = `
        <div class="techstack-page page-transition">

            <!-- Hero Section -->
            <div class="tech-hero glass-card float-in" style="padding: 3rem 2.5rem; border-radius: 20px; text-align: center; margin-bottom: 2.5rem; background: linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.08) 50%, rgba(236,72,153,0.06) 100%); border: 1px solid rgba(59,130,246,0.15);">
                <h1 class="text-gradient" style="font-size: 2.5rem; margin-bottom: 0.75rem;">Tech Stack & Architecture</h1>
                <p class="tech-subtitle" style="font-size: 1.1rem; color: var(--text-dim); max-width: 650px; margin: 0 auto; line-height: 1.6;">Built to process <strong class="counter-glow" style="color: var(--text);">1,180,000+ subsidiaries</strong> across <strong class="counter-glow" style="color: var(--text);">21,748 companies</strong> using modern web technologies and agentic AI</p>
            </div>

            <!-- Architecture Diagram -->
            <div class="tech-section reveal" style="margin-bottom: 2.5rem;">
                <h2 class="text-gradient" style="font-size: 1.4rem; margin-bottom: 1.5rem;">System Architecture</h2>
                <div class="arch-diagram glass-card" style="padding: 2rem; border-radius: 16px;">
                    <div class="arch-layer scale-in" style="animation-delay: 0ms;">
                        <div class="arch-label" style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); margin-bottom: 0.75rem;">Frontend</div>
                        <div class="arch-items" style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                            <div class="arch-box arch-frontend glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(59,130,246,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(59,130,246,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">HTML5 / CSS3 / JavaScript</div>
                            <div class="arch-box arch-frontend glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(59,130,246,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(59,130,246,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">Chart.js Visualizations</div>
                            <div class="arch-box arch-frontend glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(59,130,246,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(59,130,246,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">Server-Sent Events (SSE)</div>
                        </div>
                    </div>
                    <div class="arch-arrow" style="text-align: center; font-size: 1.5rem; padding: 0.5rem 0; color: var(--text-dim); opacity: 0.5;">&#8595;</div>
                    <div class="arch-layer scale-in" style="animation-delay: 100ms;">
                        <div class="arch-label" style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: #22c55e; margin-bottom: 0.75rem;">API Layer</div>
                        <div class="arch-items" style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                            <div class="arch-box arch-api glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(34,197,94,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(34,197,94,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">FastAPI REST Endpoints</div>
                            <div class="arch-box arch-api glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(34,197,94,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(34,197,94,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">Swagger/OpenAPI Docs</div>
                            <div class="arch-box arch-api glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(34,197,94,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(34,197,94,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">SSE Streaming</div>
                        </div>
                    </div>
                    <div class="arch-arrow" style="text-align: center; font-size: 1.5rem; padding: 0.5rem 0; color: var(--text-dim); opacity: 0.5;">&#8595;</div>
                    <div class="arch-layer scale-in" style="animation-delay: 200ms;">
                        <div class="arch-label" style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: #8b5cf6; margin-bottom: 0.75rem;">Agentic AI Engine</div>
                        <div class="arch-items" style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                            <div class="arch-box arch-ai glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(139,92,246,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(139,92,246,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">SEC EDGAR API</div>
                            <div class="arch-box arch-ai glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(139,92,246,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(139,92,246,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">Wikipedia API</div>
                            <div class="arch-box arch-ai glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(139,92,246,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(139,92,246,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">Google Gemini (Free Tier)</div>
                        </div>
                    </div>
                    <div class="arch-arrow" style="text-align: center; font-size: 1.5rem; padding: 0.5rem 0; color: var(--text-dim); opacity: 0.5;">&#8595;</div>
                    <div class="arch-layer scale-in" style="animation-delay: 300ms;">
                        <div class="arch-label" style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: #eab308; margin-bottom: 0.75rem;">Data Layer</div>
                        <div class="arch-items" style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                            <div class="arch-box arch-data glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(234,179,8,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(234,179,8,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">SAS Dataset (437K rows)</div>
                            <div class="arch-box arch-data glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(234,179,8,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(234,179,8,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">SQLite Database</div>
                            <div class="arch-box arch-data glass-card" style="padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid rgba(234,179,8,0.2); transition: all 0.3s;" onmouseenter="this.style.boxShadow='0 0 16px rgba(234,179,8,0.2)'; this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='none'; this.style.transform='none'">Timeline Algorithm</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tech Categories -->
            <div class="tech-section reveal" style="margin-bottom: 2.5rem;">
                <h2 class="text-gradient" style="font-size: 1.4rem; margin-bottom: 1.5rem;">Technologies Used</h2>
                <div class="tech-grid stagger-in" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem;">

                    ${renderTechCategory('Backend', 'Server-side technologies powering the API and data pipeline', '#3b82f6', [
                        { name: 'Python', desc: 'Core programming language', tag: 'Language' },
                        { name: 'FastAPI', desc: 'High-performance async web framework with auto-generated OpenAPI docs', tag: 'Framework' },
                        { name: 'Uvicorn', desc: 'ASGI server for production-grade serving', tag: 'Server' },
                        { name: 'Pandas', desc: 'Data manipulation and analysis for processing 437K subsidiary records', tag: 'Data' },
                        { name: 'PyReadStat', desc: 'Reading SAS7BDAT files directly from the statistical software format', tag: 'Data' },
                        { name: 'SQLite', desc: 'Lightweight relational database for persistent storage and fast querying', tag: 'Database' },
                        { name: 'Pydantic', desc: 'Data validation and serialization via FastAPI', tag: 'Validation' },
                    ])}

                    ${renderTechCategory('Frontend', 'Client-side technologies for the interactive dashboard', '#22c55e', [
                        { name: 'HTML5', desc: 'Semantic markup for the single-page application shell', tag: 'Markup' },
                        { name: 'CSS3', desc: 'Custom dark theme with CSS variables, grid layouts, and responsive design', tag: 'Styling' },
                        { name: 'JavaScript (ES6+)', desc: 'Vanilla JS with async/await, template literals, and dynamic DOM rendering', tag: 'Language' },
                        { name: 'Chart.js', desc: 'Interactive doughnut charts and Gantt-style horizontal bar timelines', tag: 'Visualization' },
                        { name: 'Server-Sent Events', desc: 'Real-time streaming of AI search progress from backend to browser', tag: 'Real-time' },
                        { name: 'Fetch API', desc: 'Native browser API for async REST calls to the backend', tag: 'Networking' },
                    ])}

                    ${renderTechCategory('Agentic AI & Data Sources', 'AI reasoning and public data integration for subsidiary research', '#8b5cf6', [
                        { name: 'Google Gemini', desc: 'Free-tier LLM (gemini-2.0-flash) for reasoning about subsidiary dates and classifying formation types', tag: 'AI/LLM' },
                        { name: 'SEC EDGAR API', desc: 'Free SEC API for retrieving 10-K, 8-K filings and Exhibit 21 subsidiary lists', tag: 'Data Source' },
                        { name: 'Wikipedia API', desc: 'Free encyclopedia API for finding acquisition/merger historical information', tag: 'Data Source' },
                        { name: 'Agentic Orchestrator', desc: 'Multi-step AI agent that coordinates search across sources, reasons about results, and stores enrichments', tag: 'Architecture' },
                        { name: 'SSE Streaming', desc: 'Real-time progress updates streamed to the browser during AI search', tag: 'UX' },
                        { name: 'Fallback Heuristics', desc: 'Rule-based date extraction when AI is unavailable — keyword matching for acquisition/restructuring classification', tag: 'Resilience' },
                    ])}

                    ${renderTechCategory('Data Engineering', 'Pipeline for processing and analyzing the subsidiary dataset', '#eab308', [
                        { name: 'SAS7BDAT Parsing', desc: 'Reading proprietary SAS format with Latin-1 encoding and byte-string decoding', tag: 'ETL' },
                        { name: 'Timeline Algorithm', desc: 'Custom algorithm comparing Exhibit 21 filings across years to determine subsidiary TimeIn/TimeOut', tag: 'Algorithm' },
                        { name: 'Batch Processing', desc: 'Efficient bulk insert of 435K records using executemany and pre-computed counters', tag: 'Performance' },
                        { name: 'Data Normalization', desc: 'Name deduplication via case-normalized grouping across filing years', tag: 'ETL' },
                        { name: 'Confidence Scoring', desc: 'Algorithmic confidence levels (HIGH/MEDIUM/LOW) based on filing date bracketing', tag: 'Quality' },
                        { name: 'CSV Export', desc: 'Per-company downloadable CSV with all computed TimeIn/TimeOut columns', tag: 'Output' },
                    ])}

                </div>
            </div>

            <!-- Skills Summary -->
            <div class="tech-section reveal" style="margin-bottom: 2.5rem;">
                <h2 class="text-gradient" style="font-size: 1.4rem; margin-bottom: 1.5rem;">Skills Demonstrated</h2>
                <div class="skills-grid stagger-in" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
                    ${renderSkillCard('Full-Stack Web Development', 'Built a complete web application with FastAPI backend, vanilla JS frontend, RESTful API design, and real-time SSE streaming', ['Python', 'JavaScript', 'HTML/CSS', 'REST APIs', 'SSE'])}
                    ${renderSkillCard('Data Engineering & ETL', 'Processed 437K records from proprietary SAS format, built algorithmic pipelines, and designed efficient SQLite storage', ['Pandas', 'SQL', 'ETL Pipelines', 'Data Cleaning', 'Batch Processing'])}
                    ${renderSkillCard('Agentic AI Architecture', 'Designed a multi-source AI agent that orchestrates SEC EDGAR, Wikipedia, and LLM reasoning with streaming progress', ['LLM Integration', 'Agent Design', 'API Orchestration', 'Prompt Engineering'])}
                    ${renderSkillCard('Data Visualization', 'Interactive dashboards with Chart.js — doughnut charts, Gantt-style timelines, and dynamic filtering', ['Chart.js', 'Data Viz', 'Dashboard Design', 'UX'])}
                    ${renderSkillCard('Financial Data Analysis', 'SEC EDGAR integration, Exhibit 21 subsidiary tracking, 8-K filing analysis, and corporate structure research', ['SEC Filings', 'Corporate Finance', 'EDGAR API', 'M&A Research'])}
                    ${renderSkillCard('API Design & Documentation', 'Auto-generated Swagger/OpenAPI documentation, paginated endpoints, search/filter/export capabilities', ['OpenAPI', 'Swagger', 'API Design', 'Documentation'])}
                </div>
            </div>

            <!-- Project Stats -->
            <div class="tech-section reveal" style="margin-bottom: 2.5rem;">
                <h2 class="text-gradient" style="font-size: 1.4rem; margin-bottom: 1.5rem;">Project By The Numbers</h2>
                <div class="stats-grid stagger-in" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                    <div class="stat-card glow-card scale-in" style="animation-delay: 0ms;">
                        <div class="label">Records Processed</div>
                        <div class="value primary counter-glow">1,180,000+</div>
                    </div>
                    <div class="stat-card glow-card scale-in" style="animation-delay: 60ms;">
                        <div class="label">Companies Tracked</div>
                        <div class="value blue counter-glow">21,748</div>
                    </div>
                    <div class="stat-card glow-card scale-in" style="animation-delay: 120ms;">
                        <div class="label">High Confidence</div>
                        <div class="value green counter-glow">57.6%</div>
                    </div>
                    <div class="stat-card glow-card scale-in" style="animation-delay: 180ms;">
                        <div class="label">API Endpoints</div>
                        <div class="value yellow counter-glow">10</div>
                    </div>
                    <div class="stat-card glow-card scale-in" style="animation-delay: 240ms;">
                        <div class="label">Data Sources</div>
                        <div class="value primary counter-glow">3</div>
                    </div>
                    <div class="stat-card glow-card scale-in" style="animation-delay: 300ms;">
                        <div class="label">Cost</div>
                        <div class="value green counter-glow">$0</div>
                    </div>
                </div>
            </div>

            <!-- How It Works -->
            <div class="tech-section reveal" style="margin-bottom: 2rem;">
                <h2 class="text-gradient" style="font-size: 1.4rem; margin-bottom: 1.5rem;">How It Works</h2>
                <div class="how-it-works stagger-in" style="display: flex; flex-direction: column; gap: 0;">
                    ${[
                        { num: '1', title: 'Load & Parse', desc: 'Read the 437K-row SAS dataset, decode Latin-1 byte strings, normalize company and subsidiary names', color: '#3b82f6' },
                        { num: '2', title: 'Compute Timelines', desc: 'Compare Exhibit 21 filings across years for each CIK. If a subsidiary appears in 2001 but not 1999, TimeIn is "Between 1999 and 2001"', color: '#22c55e' },
                        { num: '3', title: 'Score Confidence', desc: 'HIGH when multiple filing dates bracket the event. LOW when only one filing exists. Drives prioritization for AI enrichment', color: '#eab308' },
                        { num: '4', title: 'AI Enrichment (On-Demand)', desc: 'For interesting cases: search SEC EDGAR 8-K filings + Wikipedia, then use Gemini AI to reason about precise dates and classify as Internal/Acquisition/Restructuring', color: '#8b5cf6' },
                    ].map((step, i) => `
                        <div class="how-step glass-card float-in" style="display: flex; align-items: flex-start; gap: 1.25rem; padding: 1.25rem 1.5rem; border-radius: 12px; margin-bottom: 0.5rem; animation-delay: ${i * 100}ms; position: relative; border-left: 3px solid ${step.color};">
                            <div class="how-number" style="width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; background: linear-gradient(135deg, ${step.color}, ${step.color}88); color: #fff; flex-shrink: 0; box-shadow: 0 0 16px ${step.color}33;">${step.num}</div>
                            <div class="how-content">
                                <h3 style="font-weight: 700; margin-bottom: 0.35rem; font-size: 1rem;">${step.title}</h3>
                                <p style="color: var(--text-dim); font-size: 0.85rem; line-height: 1.5; margin: 0;">${step.desc}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

        </div>
    `;
}


function renderTechCategory(title, description, accentColor, items) {
    return `
        <div class="tech-category glass-card glow-card float-in" style="padding: 1.5rem; border-radius: 14px; border-top: 3px solid ${accentColor}; transition: all 0.3s;">
            <div class="tech-cat-header" style="margin-bottom: 1.25rem;">
                <h3 style="font-weight: 700; font-size: 1.05rem; margin-bottom: 0.35rem; color: ${accentColor};">${title}</h3>
                <p style="color: var(--text-dim); font-size: 0.8rem; line-height: 1.4;">${description}</p>
            </div>
            <div class="tech-items" style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${items.map((item, idx) => `
                    <div class="tech-item" style="padding: 0.65rem 0.85rem; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(138,144,165,0.08); transition: all 0.25s ease; cursor: default;"
                         onmouseenter="this.style.background='rgba(${accentColor === '#3b82f6' ? '59,130,246' : accentColor === '#22c55e' ? '34,197,94' : accentColor === '#8b5cf6' ? '139,92,246' : '234,179,8'},0.06)'; this.style.borderColor='${accentColor}30'; this.style.transform='translateX(4px)'"
                         onmouseleave="this.style.background='rgba(255,255,255,0.02)'; this.style.borderColor='rgba(138,144,165,0.08)'; this.style.transform='none'">
                        <div class="tech-item-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
                            <span class="tech-item-name" style="font-weight: 600; font-size: 0.9rem;">${item.name}</span>
                            <span class="badge badge-enriched" style="font-size: 0.65rem; padding: 0.15rem 0.5rem;">${item.tag}</span>
                        </div>
                        <p class="tech-item-desc" style="color: var(--text-dim); font-size: 0.78rem; margin: 0; line-height: 1.4;">${item.desc}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}


function renderSkillCard(title, description, tags) {
    return `
        <div class="skill-card glass-card glow-card float-in" style="padding: 1.5rem; border-radius: 14px; transition: all 0.3s ease;"
             onmouseenter="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 30px rgba(59,130,246,0.12)'"
             onmouseleave="this.style.transform='none'; this.style.boxShadow='none'">
            <h3 style="font-weight: 700; font-size: 1rem; margin-bottom: 0.5rem;">${title}</h3>
            <p style="color: var(--text-dim); font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.75rem;">${description}</p>
            <div class="skill-tags" style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
                ${tags.map(t => `<span class="skill-tag" style="padding: 0.25rem 0.65rem; border-radius: 12px; font-size: 0.72rem; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); color: var(--primary); font-weight: 500;">${t}</span>`).join('')}
            </div>
        </div>
    `;
}
