// =========================================
// The Perplexity Archive — Application
// =========================================

// State
let archiveData = null;
let currentArticle = null;
let allArticles = [];

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    initSearchFunctionality();
    initSmoothScroll();
    initScrollAnimations();
    await loadArchiveData();
}

// =========================================
// Data Loading
// =========================================

async function loadArchiveData() {
    try {
        const [indexResponse, statsResponse] = await Promise.all([
            fetch('./api/articles/index.json').catch(() => null),
            fetch('./api/stats.json').catch(() => null)
        ]);
        
        if (indexResponse && indexResponse.ok && statsResponse && statsResponse.ok) {
            const indexData = await indexResponse.json();
            const stats = await statsResponse.json();
            
            archiveData = { stats: stats, articles: indexData.articles };
            allArticles = indexData.articles;
            
            console.log(`✓ Loaded paginated API: ${allArticles.length} articles`);
            
            if (allArticles.length > 0) {
                const featured = allArticles.reduce((best, curr) => 
                    (curr.confidence_score || 0) > (best.confidence_score || 0) ? curr : best
                , allArticles[0]);
                
                const fullArticle = await loadFullArticle(featured.slug);
                if (fullArticle) {
                    currentArticle = fullArticle;
                    renderFeaturedArticle(fullArticle);
                }
            }
        } else {
            console.log('⚠ Paginated API not found, falling back to data.json');
            const response = await fetch('./data.json');
            archiveData = await response.json();
            allArticles = archiveData.articles || archiveData.recent || [];
            
            if (archiveData.featured) {
                currentArticle = archiveData.featured;
                renderFeaturedArticle(archiveData.featured);
            }
        }
        
        updateStatsDisplay(archiveData.stats);
        updateCategoryCounts(archiveData.stats.categories || []);
        updateFooter(archiveData.stats, allArticles);
        
    } catch (error) {
        console.error('Failed to load archive data:', error);
    }
}

async function loadFullArticle(slug) {
    try {
        const response = await fetch(`./api/articles/${slug}.json`);
        if (response.ok) return await response.json();
        if (archiveData && archiveData.articles) {
            return archiveData.articles.find(a => a.slug === slug);
        }
        return null;
    } catch (error) {
        console.error(`Failed to load article ${slug}:`, error);
        return null;
    }
}

// =========================================
// Rendering Functions
// =========================================

function updateStatsDisplay(stats) {
    if (!stats) return;
    document.querySelectorAll('.stat-number').forEach(counter => {
        const statType = counter.dataset.stat;
        let value;
        if (statType === 'articles') value = stats.article_count || 0;
        else if (statType === 'sources') value = stats.source_count || 0;
        else if (statType === 'categories') value = stats.category_count || 0;
        if (value !== undefined) {
            counter.dataset.count = value;
            animateCounter(counter);
        }
    });
}

function updateFooter(stats, articles) {
    const footerCount = document.getElementById('footerArticleCount');
    if (footerCount && stats) {
        footerCount.textContent = `${(stats.article_count || 0).toLocaleString()} articles indexed`;
    }
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate && articles && articles.length > 0) {
        const mostRecent = articles[0]?.created_at;
        if (mostRecent) {
            const diffHours = Math.floor((new Date() - new Date(mostRecent)) / (1000 * 60 * 60));
            if (diffHours < 1) lastUpdate.textContent = 'Updated just now';
            else if (diffHours < 24) lastUpdate.textContent = `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            else lastUpdate.textContent = `Updated ${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) > 1 ? 's' : ''} ago`;
        }
    }
}

function updateCategoryCounts(categories) {
    const categoryMap = {};
    categories.forEach(c => categoryMap[c.category] = c.count);
    document.querySelectorAll('.topic-card').forEach(card => {
        const name = card.querySelector('.topic-name')?.textContent;
        if (name && categoryMap[name]) {
            const countEl = card.querySelector('.topic-count');
            if (countEl) countEl.textContent = `${categoryMap[name].toLocaleString()} articles`;
        }
    });
}

function renderFeaturedArticle(article) {
    const container = document.getElementById('featuredArticle');
    if (!container) return;
    
    const perspectives = typeof article.perspectives === 'string' 
        ? JSON.parse(article.perspectives) : article.perspectives || [];
    const lastVerified = article.last_verified_at 
        ? new Date(article.last_verified_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'Recently';
    const updatedAgo = getTimeAgo(article.updated_at);
    const sectionBadge = document.querySelector('.section-badge');
    if (sectionBadge) sectionBadge.textContent = `Updated ${updatedAgo}`;
    
    container.innerHTML = `
        <div class="article-header">
            <div class="article-meta">
                <span class="article-category">${escapeHtml(article.category)}</span>
                <span class="confidence-badge ${getConfidenceClass(article.confidence_score)}">
                    ${article.confidence_score}% Confidence
                </span>
            </div>
            <h3 class="article-title">${escapeHtml(article.title)}</h3>
            <p class="article-excerpt">${escapeHtml(article.excerpt || '')}</p>
        </div>
        <div class="article-content">
            ${renderArticleContent(article.content)}
            ${perspectives.length > 0 ? `
            <div class="perspectives-panel">
                <div class="perspectives-header"><span>Multiple Perspectives</span></div>
                <div class="perspectives-grid">
                    ${perspectives.map(p => `
                        <div class="perspective">
                            <span class="perspective-label">${escapeHtml(p.label)}</span>
                            <p>${escapeHtml(p.text)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}
        </div>
        ${renderSourcesPanel(article.sources || [])}
        <div class="article-footer">
            <div class="footer-info">
                <span class="last-verified">Last verified: ${lastVerified}</span>
            </div>
            <button class="read-more-btn" onclick="showFullArticle()">
                Read Full Article
            </button>
        </div>
    `;
    initSourceHighlighting();
}

function renderArticleContent(content) {
    if (!content) return '';
    const sections = content.split(/\n\n## /);
    let html = '';
    sections.forEach((section, i) => {
        if (i === 0) {
            html += `<div class="content-section"><h4>Overview</h4><p>${escapeHtml(section.trim())}</p></div>`;
        } else {
            const lines = section.split('\n\n');
            const title = lines[0].trim();
            const body = lines.slice(1).join('\n\n').trim();
            html += `<div class="content-section"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></div>`;
        }
    });
    return html;
}

function renderSourcesPanel(sources) {
    if (!sources || sources.length === 0) return '';
    return `
        <div class="sources-panel">
            <div class="sources-header">
                <h4>Sources & Citations</h4>
                <span class="sources-count">${sources.length} sources verified</span>
            </div>
            <div class="sources-list">
                ${sources.map((source, i) => `
                    <div class="source-item" data-id="${i + 1}">
                        <span class="source-number">${i + 1}</span>
                        <div class="source-content">
                            <a href="${escapeHtml(source.url || '#')}" class="source-title" target="_blank" rel="noopener">
                                ${escapeHtml(source.title)}
                            </a>
                            <span class="source-meta">${escapeHtml(source.source_type || 'Web')}</span>
                        </div>
                        <span class="source-trust ${source.trust_level || 'medium'}">
                            ${capitalize(source.trust_level || 'Medium')} Trust
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// =========================================
// Search
// =========================================

function searchArticles(query) {
    if (!archiveData || !allArticles.length) return [];
    const q = query.toLowerCase();
    return allArticles.filter(article => 
        article.title.toLowerCase().includes(q) ||
        (article.excerpt && article.excerpt.toLowerCase().includes(q)) ||
        (article.category && article.category.toLowerCase().includes(q))
    );
}

function initSearchFunctionality() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const suggestions = document.querySelectorAll('.suggestion');
    searchBtn?.addEventListener('click', handleSearch);
    searchInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });
    suggestions.forEach(suggestion => {
        suggestion.addEventListener('click', () => {
            if (searchInput) searchInput.value = suggestion.dataset.query;
            handleSearch();
        });
    });
}

async function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput?.value.trim();
    if (!query) return;
    
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) searchBtn.innerHTML = '<span>Searching...</span>';
    await new Promise(r => setTimeout(r, 500));
    const results = searchArticles(query);
    if (searchBtn) searchBtn.innerHTML = '<span>Explore</span>';
    
    if (results.length > 0) {
        const fullArticle = await loadFullArticle(results[0].slug);
        if (fullArticle) {
            currentArticle = fullArticle;
            renderFeaturedArticle(currentArticle);
            document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' });
            showToast(`Found ${results.length} result${results.length > 1 ? 's' : ''} for "${query}"`);
        }
    } else {
        showToast(`No results for "${query}"`);
    }
}

// =========================================
// Utility Functions
// =========================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function getConfidenceClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
}

function getTimeAgo(dateStr) {
    if (!dateStr) return 'recently';
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(100px);background:#13343B;color:white;padding:16px 24px;border-radius:12px;font-size:0.9375rem;font-weight:500;box-shadow:0 8px 32px rgba(9,23,23,0.2);z-index:1000;opacity:0;transition:all 0.4s ease;';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; });
    setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(100px)'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3000);
}

function animateCounter(element) {
    const target = parseInt(element.dataset.count);
    if (isNaN(target)) return;
    const duration = 2000;
    const startTime = performance.now();
    function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        element.textContent = Math.floor(easeOutQuart(progress) * target).toLocaleString('en-US');
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function initSourceHighlighting() {
    document.querySelectorAll('.source-ref').forEach(ref => {
        ref.addEventListener('click', () => {
            const sourceItem = document.querySelector(`.source-item[data-id="${ref.dataset.source}"]`);
            if (sourceItem) {
                document.querySelectorAll('.source-item').forEach(item => item.classList.remove('highlighted'));
                sourceItem.classList.add('highlighted');
                sourceItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const navHeight = 72;
                window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20, behavior: 'smooth' });
            }
        });
    });
}

function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('.principle-card, .compare-section, .topic-card');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                entry.target.style.animationDelay = `${index * 0.1}s`;
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    animatedElements.forEach(el => { el.style.opacity = '0'; observer.observe(el); });
}

function showRevisions() {
    if (currentArticle && currentArticle.revisions) {
        showToast(`${currentArticle.revisions.length} revision${currentArticle.revisions.length !== 1 ? 's' : ''} recorded`);
    }
}

function showFullArticle() {
    if (currentArticle && currentArticle.slug) {
        window.location.href = `article.html?slug=${encodeURIComponent(currentArticle.slug)}`;
    } else if (currentArticle) {
        showToast(`Viewing: ${currentArticle.title}`);
    }
}

document.querySelectorAll('.topic-card').forEach(card => {
    card.addEventListener('click', (e) => {
        e.preventDefault();
        const topicName = card.querySelector('.topic-name')?.textContent;
        showToast(`Loading ${topicName} articles...`);
    });
});
