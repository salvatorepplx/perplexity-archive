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
    // Initialize components
    initSearchFunctionality();
    initSmoothScroll();
    initScrollAnimations();
    
    // Load data from static JSON
    await loadArchiveData();
}

// =========================================
// Data Loading
// =========================================

async function loadArchiveData() {
    try {
        // Try to load paginated API structure first (new architecture)
        const [indexResponse, statsResponse] = await Promise.all([
            fetch('./api/articles/index.json').catch(() => null),
            fetch('./api/stats.json').catch(() => null)
        ]);
        
        if (indexResponse && indexResponse.ok && statsResponse && statsResponse.ok) {
            // New paginated architecture
            const indexData = await indexResponse.json();
            const stats = await statsResponse.json();
            
            archiveData = {
                stats: stats,
                articles: indexData.articles
            };
            allArticles = indexData.articles;
            
            console.log(`✓ Loaded paginated API: ${allArticles.length} articles (${Math.round(JSON.stringify(indexData).length / 1024)}KB)`);
            
            // Load featured article on-demand
            if (allArticles.length > 0) {
                // Get highest confidence article as featured
                const featured = allArticles.reduce((best, curr) => 
                    (curr.confidence_score || 0) > (best.confidence_score || 0) ? curr : best
                , allArticles[0]);
                
                // Fetch full article content
                const fullArticle = await loadFullArticle(featured.slug);
                if (fullArticle) {
                    currentArticle = fullArticle;
                    renderFeaturedArticle(fullArticle);
                }
            }
            
        } else {
            // Fallback to legacy data.json (backward compatibility)
            console.log('⚠ Paginated API not found, falling back to data.json');
            const response = await fetch('./data.json');
            archiveData = await response.json();
            allArticles = archiveData.articles || archiveData.recent || [];
            
            if (archiveData.featured) {
                currentArticle = archiveData.featured;
                renderFeaturedArticle(archiveData.featured);
            }
            
            console.log(`✓ Loaded legacy data.json: ${allArticles.length} articles (${Math.round(JSON.stringify(archiveData).length / 1024)}KB)`);
        }
        
        // Update UI with loaded data
        updateStatsDisplay(archiveData.stats);
        updateCategoryCounts(archiveData.stats.categories || []);
        updateFooter(archiveData.stats, allArticles);
        
    } catch (error) {
        console.error('Failed to load archive data:', error);
        // Display error state to user
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: var(--medium-teal);">
                    <p style="font-size: 18px; margin-bottom: 8px;">Unable to load archive data</p>
                    <p style="font-size: 14px;">Please refresh the page or try again later.</p>
                </div>
            `;
        }
    }
}

async function loadFullArticle(slug) {
    try {
        const response = await fetch(`./api/articles/${slug}.json`);
        if (response.ok) {
            return await response.json();
        }
        
        // Fallback: search in legacy data if paginated version not found
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
    
    const counters = document.querySelectorAll('.stat-number');
    counters.forEach(counter => {
        const statType = counter.dataset.stat;
        let value;
        
        // Map to real stats from data.json
        if (statType === 'articles') {
            value = stats.article_count || 0;
        } else if (statType === 'sources') {
            value = stats.source_count || 0;
        } else if (statType === 'categories') {
            value = stats.category_count || 0;
        }
        
        if (value !== undefined) {
            counter.dataset.count = value;
            animateCounter(counter);
        }
    });
}

function updateFooter(stats, articles) {
    // Update footer article count with real data
    const footerCount = document.getElementById('footerArticleCount');
    if (footerCount && stats) {
        footerCount.textContent = `${(stats.article_count || 0).toLocaleString()} articles indexed`;
    }
    
    // Update last update time based on most recent article
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate && articles && articles.length > 0) {
        const mostRecent = articles[0]?.created_at;
        if (mostRecent) {
            const date = new Date(mostRecent);
            const now = new Date();
            const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
            if (diffHours < 1) {
                lastUpdate.textContent = 'Updated just now';
            } else if (diffHours < 24) {
                lastUpdate.textContent = `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            } else {
                const diffDays = Math.floor(diffHours / 24);
                lastUpdate.textContent = `Updated ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            }
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
            if (countEl) {
                countEl.textContent = `${categoryMap[name].toLocaleString()} articles`;
            }
        }
    });
}

function renderFeaturedArticle(article) {
    const container = document.getElementById('featuredArticle');
    if (!container) return;
    
    // Parse perspectives if string
    const perspectives = typeof article.perspectives === 'string' 
        ? JSON.parse(article.perspectives) 
        : article.perspectives || [];
    
    // Format dates
    const lastVerified = article.last_verified_at 
        ? new Date(article.last_verified_at).toLocaleDateString('en-US', { 
            year: 'numeric', month: 'long', day: 'numeric' 
          })
        : 'Recently';
    
    const updatedAgo = getTimeAgo(article.updated_at);
    
    // Update section badge
    const sectionBadge = document.querySelector('.section-badge');
    if (sectionBadge) {
        sectionBadge.textContent = `Updated ${updatedAgo}`;
    }
    
    container.innerHTML = `
        <div class="article-header">
            <div class="article-meta">
                <span class="article-category">${escapeHtml(article.category)}</span>
                <span class="confidence-badge ${getConfidenceClass(article.confidence_score)}">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z"/>
                        <path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/>
                    </svg>
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
                <div class="perspectives-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                        <path d="M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                    <span>Multiple Perspectives</span>
                </div>
                <div class="perspectives-grid">
                    ${perspectives.map(p => `
                        <div class="perspective">
                            <span class="perspective-label">${escapeHtml(p.label)}</span>
                            <p>${escapeHtml(p.text)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
        
        ${renderSourcesPanel(article.sources || [])}
        
        <div class="article-footer">
            <div class="footer-info">
                <span class="last-verified">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        <path d="M9 12l2 2 4-4"/>
                    </svg>
                    Last verified: ${lastVerified}
                </span>
                <span class="revision-link" onclick="showRevisions()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    View revision history (${(article.revisions || []).length} revisions)
                </span>
            </div>
            <button class="read-more-btn" onclick="showFullArticle()">
                Read Full Article
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            </button>
        </div>
    `;
    
    // Re-initialize source highlighting for new content
    initSourceHighlighting();
}

function renderArticleContent(content) {
    if (!content) return '';
    
    // Convert markdown-like content to HTML
    const sections = content.split(/\n\n## /);
    
    let html = '';
    sections.forEach((section, i) => {
        if (i === 0) {
            html += `
                <div class="content-section">
                    <h4>Overview</h4>
                    <p>${escapeHtml(section.trim())}</p>
                </div>
            `;
        } else {
            const lines = section.split('\n\n');
            const title = lines[0].trim();
            const body = lines.slice(1).join('\n\n').trim();
            
            html += `
                <div class="content-section">
                    <h4>${escapeHtml(title)}</h4>
                    <p>${escapeHtml(body)}</p>
                </div>
            `;
        }
    });
    
    return html;
}

function renderSourcesPanel(sources) {
    if (!sources || sources.length === 0) return '';
    
    return `
        <div class="sources-panel">
            <div class="sources-header">
                <h4>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                        <path d="M16 17l5-5-5-5"/>
                        <path d="M21 12H9"/>
                    </svg>
                    Sources & Citations
                </h4>
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
                            <span class="source-meta">
                                ${escapeHtml(source.source_type || 'Web')} 
                                ${source.publication_date ? `• ${source.publication_date}` : ''}
                            </span>
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
    
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    suggestions.forEach(suggestion => {
        suggestion.addEventListener('click', () => {
            const query = suggestion.dataset.query;
            if (searchInput) searchInput.value = query;
            handleSearch();
        });
    });
}

async function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput?.value.trim();
    
    if (!query) return;
    
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.innerHTML = `
            <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
            </svg>
            <span>Searching...</span>
        `;
    }
    
    // Add spin animation if not present
    if (!document.getElementById('spin-style')) {
        const style = document.createElement('style');
        style.id = 'spin-style';
        style.textContent = `
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .spin { animation: spin 1s linear infinite; }
        `;
        document.head.appendChild(style);
    }
    
    // Small delay for visual feedback
    await new Promise(r => setTimeout(r, 500));
    
    // Search articles
    const results = searchArticles(query);
    
    // Reset button
    if (searchBtn) {
        searchBtn.innerHTML = `
            <span>Explore</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
        `;
    }
    
    if (results.length > 0) {
        // Load the first result as featured
        // Fetch full article content on-demand
        const fullArticle = await loadFullArticle(results[0].slug);
        
        if (fullArticle) {
            currentArticle = fullArticle;
            renderFeaturedArticle(currentArticle);
            document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
            showToast(`Found ${results.length} result${results.length > 1 ? 's' : ''} for "${query}"`);
        } else {
            showToast('Failed to load article details');
        }
    } else {
        // No results - trigger automatic ingestion request
        triggerTopicIngestion(query);
    }
}

// =========================================
// Auto-Ingestion for Missing Topics
// =========================================

function triggerTopicIngestion(topic) {
    // Show user feedback
    showToast(`"${topic}" not found. Requesting article creation...`);
    
    // Check if we recently requested this topic (prevent spam)
    const recentRequests = JSON.parse(localStorage.getItem('archive_topic_requests') || '[]');
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const validRequests = recentRequests.filter(r => r.timestamp > oneHourAgo);
    
    if (validRequests.some(r => r.topic.toLowerCase() === topic.toLowerCase())) {
        setTimeout(() => {
            showToast(`Already requested "${topic}" recently. Check back in an hour.`);
        }, 2000);
        return;
    }
    
    // Save this request
    validRequests.push({ topic, timestamp: Date.now() });
    localStorage.setItem('archive_topic_requests', JSON.stringify(validRequests));
    
    // Send email to trigger ingestion
    const email = 'salvatore@perplexity.ai';
    const subject = encodeURIComponent(`[Archive Chat] Topic Request: ${topic}`);
    const body = encodeURIComponent(
        `[Archive Topic Request]\n\n` +
        `A user searched for "${topic}" but no article exists.\n\n` +
        `Please create an article about: ${topic}\n\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Source: Archive search`
    );
    
    // Open email client
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    
    // Show confirmation after brief delay
    setTimeout(() => {
        showToast(`📧 Request sent! Article for "${topic}" will be created soon.`);
    }, 1500);
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

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getConfidenceClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
}

function getTimeAgo(dateStr) {
    if (!dateStr) return 'recently';
    
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #13343B;
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 0.9375rem;
        font-weight: 500;
        box-shadow: 0 8px 32px rgba(9, 23, 23, 0.2);
        z-index: 1000;
        opacity: 0;
        transition: all 0.4s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
    });
    
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// =========================================
// Counter Animation
// =========================================

function animateCounter(element) {
    const target = parseInt(element.dataset.count);
    if (isNaN(target)) return;
    
    const duration = 2000;
    const startTime = performance.now();
    
    function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuart(progress);
        const current = Math.floor(easedProgress * target);
        
        element.textContent = current.toLocaleString('en-US');
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// =========================================
// Source Highlighting
// =========================================

function initSourceHighlighting() {
    const sourceRefs = document.querySelectorAll('.source-ref');
    const sourceItems = document.querySelectorAll('.source-item');
    
    sourceRefs.forEach(ref => {
        ref.addEventListener('click', () => {
            const sourceId = ref.dataset.source;
            const sourceItem = document.querySelector(`.source-item[data-id="${sourceId}"]`);
            
            if (sourceItem) {
                sourceItems.forEach(item => item.classList.remove('highlighted'));
                sourceItem.classList.add('highlighted');
                
                if (!document.getElementById('highlight-styles')) {
                    const style = document.createElement('style');
                    style.id = 'highlight-styles';
                    style.textContent = `
                        .source-item.highlighted {
                            background: rgba(32, 184, 205, 0.2) !important;
                            border-left: 3px solid #20B8CD;
                        }
                    `;
                    document.head.appendChild(style);
                }
                
                sourceItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });
}

// =========================================
// Smooth Scroll
// =========================================

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href === '#') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            
            if (target) {
                const navHeight = 72;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });
}

// =========================================
// Scroll Animations
// =========================================

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
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        observer.observe(el);
    });
}

// =========================================
// Interactive Actions
// =========================================

function showRevisions() {
    if (currentArticle && currentArticle.revisions) {
        const count = currentArticle.revisions.length;
        showToast(`${count} revision${count !== 1 ? 's' : ''} recorded for this article`);
    }
}

function showFullArticle() {
    if (currentArticle && currentArticle.slug) {
        window.location.href = `article.html?slug=${encodeURIComponent(currentArticle.slug)}`;
    } else if (currentArticle) {
        showToast(`Viewing full article: ${currentArticle.title}`);
    }
}

// Topic card clicks - load articles from that category
document.querySelectorAll('.topic-card').forEach(card => {
    card.addEventListener('click', (e) => {
        e.preventDefault();
        const topicName = card.querySelector('.topic-name')?.textContent;
        if (topicName && archiveData?.by_category?.[topicName]) {
            const categoryArticles = archiveData.by_category[topicName];
            if (categoryArticles.length > 0) {
                currentArticle = categoryArticles[0];
                renderFeaturedArticle(currentArticle);
                document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
                showToast(`Showing ${categoryArticles.length} ${topicName} articles`);
            }
        } else {
            showToast(`Loading ${topicName} articles...`);
        }
    });
});
