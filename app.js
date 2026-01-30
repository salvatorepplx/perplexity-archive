// The Perplexity Archive - Application
let archiveData = null;
let currentArticle = null;
let allArticles = [];

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    initSearchFunctionality();
    await loadArchiveData();
}

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
            console.log('Loaded ' + allArticles.length + ' articles');
            
            if (allArticles.length > 0) {
                const featured = allArticles.reduce((best, curr) => 
                    (curr.confidence_score || 0) > (best.confidence_score || 0) ? curr : best
                , allArticles[0]);
                currentArticle = featured;
                renderFeaturedArticle(featured);
            }
        } else {
            const response = await fetch('./data.json');
            archiveData = await response.json();
            allArticles = archiveData.articles || [];
            if (archiveData.featured) {
                currentArticle = archiveData.featured;
                renderFeaturedArticle(archiveData.featured);
            }
        }
        updateStatsDisplay(archiveData.stats);
        updateCategoryCounts(archiveData.stats.categories || []);
    } catch (error) {
        console.error('Failed to load archive data:', error);
    }
}

function updateStatsDisplay(stats) {
    if (!stats) return;
    document.querySelectorAll('.stat-number').forEach(counter => {
        const statType = counter.dataset.stat;
        let value;
        if (statType === 'articles') value = stats.article_count || 0;
        else if (statType === 'sources') value = stats.source_count || 0;
        else if (statType === 'categories') value = stats.category_count || 0;
        if (value !== undefined) {
            counter.textContent = value.toLocaleString();
        }
    });
}

function updateCategoryCounts(categories) {
    const categoryMap = {};
    categories.forEach(c => categoryMap[c.category] = c.count);
    document.querySelectorAll('.topic-card').forEach(card => {
        const name = card.querySelector('.topic-name')?.textContent;
        if (name && categoryMap[name]) {
            const countEl = card.querySelector('.topic-count');
            if (countEl) countEl.textContent = categoryMap[name] + ' articles';
        }
    });
}

function renderFeaturedArticle(article) {
    const container = document.getElementById('featuredArticle');
    if (!container || !article) return;
    
    const confClass = (article.confidence_score >= 80) ? 'high' : (article.confidence_score >= 60) ? 'medium' : 'low';
    
    container.innerHTML = `
        <div class="article-header">
            <div class="article-meta">
                <span class="article-category">${escapeHtml(article.category)}</span>
                <span class="confidence-badge ${confClass}">${article.confidence_score}% Confidence</span>
            </div>
            <h3 class="article-title">${escapeHtml(article.title)}</h3>
            <p class="article-excerpt">${escapeHtml(article.excerpt || '')}</p>
        </div>
        <div class="article-content">
            <p>${escapeHtml((article.content || '').substring(0, 500))}...</p>
        </div>
        <div class="article-footer">
            <button class="read-more-btn" onclick="showFullArticle()">Read Full Article</button>
        </div>
    `;
}

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
    
    searchBtn?.addEventListener('click', handleSearch);
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
}

async function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput?.value.trim();
    if (!query) return;
    
    const results = searchArticles(query);
    if (results.length > 0) {
        currentArticle = results[0];
        renderFeaturedArticle(currentArticle);
        showToast('Found ' + results.length + ' result(s) for "' + query + '"');
    } else {
        showToast('No results found for "' + query + '"');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#13343B;color:white;padding:16px 24px;border-radius:12px;font-size:0.9375rem;font-weight:500;box-shadow:0 8px 32px rgba(9,23,23,0.2);z-index:1000;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showFullArticle() {
    if (currentArticle && currentArticle.slug) {
        window.location.href = 'article.html?slug=' + encodeURIComponent(currentArticle.slug);
    }
}