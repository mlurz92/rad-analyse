import { utils } from './main.js';

class PerformanceOptimizer {
    constructor() {
        this.virtualScrolling = null;
        this.domCache = new Map();
        this.intersectionObserver = null;
        this.resizeObserver = null;
        this.mutationObserver = null;
        this.deferredTasks = new Map();
        this.lastScrollPosition = 0;
        this.scrollThrottle = null;
        this.renderQueue = [];
        this.isRendering = false;

        this.config = {
            rowHeight: 40,
            batchSize: 50,
            renderBuffer: 10,
            scrollThreshold: 150,
            deferTimeout: 100,
            virtualScrollEnabled: true,
            lazyLoadEnabled: true,
            cachingEnabled: true
        };

        this.init();
    }

    init() {
        this.setupVirtualScrolling();
        this.setupLazyLoading();
        this.setupCaching();
        this.setupObservers();
        this.setupEventDelegation();
        this.optimizeEventListeners();
    }

    setupVirtualScrolling() {
        if (!this.config.virtualScrollEnabled) return;

        const tableBody = document.querySelector('#studiesTable tbody');
        if (!tableBody) return;

        const visibleRows = Math.ceil(window.innerHeight / this.config.rowHeight);
        let totalItems = 0;
        let firstVisibleRow = 0;

        const renderVisibleRows = () => {
            requestAnimationFrame(() => {
                const scrollTop = window.scrollY;
                firstVisibleRow = Math.floor(scrollTop / this.config.rowHeight);
                const visibleRange = {
                    start: Math.max(0, firstVisibleRow - this.config.renderBuffer),
                    end: Math.min(totalItems, firstVisibleRow + visibleRows + this.config.renderBuffer)
                };

                Array.from(tableBody.children).forEach((row, index) => {
                    if (index >= visibleRange.start && index < visibleRange.end) {
                        if (row.style.display === 'none') {
                            row.style.display = '';
                            this.lazyLoadRow(row);
                        }
                    } else {
                        row.style.display = 'none';
                    }
                });
            });
        };

        this.virtualScrolling = {
            render: renderVisibleRows,
            updateTotal: (count) => {
                totalItems = count;
                renderVisibleRows();
            }
        };

        window.addEventListener('scroll', this.throttleScroll(renderVisibleRows));
        window.addEventListener('resize', this.debounce(renderVisibleRows, 150));
    }

    setupLazyLoading() {
        if (!this.config.lazyLoadEnabled) return;

        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    if (element.dataset.src) {
                        element.src = element.dataset.src;
                        element.removeAttribute('data-src');
                        this.intersectionObserver.unobserve(element);
                    }
                    if (element.dataset.load) {
                        this.loadDeferredContent(element);
                    }
                }
            });
        }, {
            rootMargin: '50px'
        });
    }

    setupCaching() {
        if (!this.config.cachingEnabled) return;

        // DOM Cache
        this.getDomElement = (selector) => {
            if (!this.domCache.has(selector)) {
                this.domCache.set(selector, document.querySelector(selector));
            }
            return this.domCache.get(selector);
        };

        // Data Cache
        this.dataCache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 Minuten

        window.addEventListener('beforeunload', () => {
            this.clearCache();
        });
    }

    setupObservers() {
        // Resize Observer
        this.resizeObserver = new ResizeObserver(this.debounce((entries) => {
            entries.forEach(entry => {
                const element = entry.target;
                if (element.classList.contains('table-container')) {
                    this.handleTableResize(element);
                }
            });
        }, 150));

        // Mutation Observer
        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && 
                    mutation.target.classList.contains('table-body')) {
                    this.handleTableMutation(mutation);
                }
            });
        });

        // Beobachter starten
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) {
            this.resizeObserver.observe(tableContainer);
            this.mutationObserver.observe(tableContainer, {
                childList: true,
                subtree: true
            });
        }
    }

    setupEventDelegation() {
        const tableContainer = document.querySelector('.table-container');
        if (!tableContainer) return;

        tableContainer.addEventListener('click', (e) => {
            const target = e.target;
            
            // Delegierte Event-Handler
            if (target.matches('.sort-header')) {
                this.handleSort(target);
            } else if (target.matches('.filter-button')) {
                this.handleFilter(target);
            } else if (target.matches('.row-action')) {
                this.handleRowAction(target);
            }
        });
    }

    optimizeEventListeners() {
        // Scroll-Performance optimieren
        this.throttleScroll = (callback) => {
            let waiting = false;
            return () => {
                if (!waiting) {
                    waiting = true;
                    requestAnimationFrame(() => {
                        callback();
                        waiting = false;
                    });
                }
            };
        };

        // Batch-Updates für DOM
        this.batchDomUpdates = async (updates) => {
            const batchSize = this.config.batchSize;
            const total = updates.length;
            let processed = 0;

            while (processed < total) {
                const batch = updates.slice(processed, processed + batchSize);
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        batch.forEach(update => update());
                        resolve();
                    });
                });
                processed += batch.length;
            }
        };
    }

    // Hilfsfunktionen
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    handleTableResize(element) {
        this.deferredTasks.set('resize', () => {
            this.virtualScrolling?.render();
            this.updateTableLayout(element);
        });
        this.executeDeferredTasks();
    }

    handleTableMutation(mutation) {
        this.deferredTasks.set('mutation', () => {
            this.virtualScrolling?.updateTotal(mutation.target.children.length);
            this.updateTableLayout(mutation.target);
        });
        this.executeDeferredTasks();
    }

    executeDeferredTasks() {
        if (this.deferTimeout) {
            clearTimeout(this.deferTimeout);
        }

        this.deferTimeout = setTimeout(() => {
            this.deferredTasks.forEach(task => task());
            this.deferredTasks.clear();
        }, this.config.deferTimeout);
    }

    updateTableLayout(element) {
        if (!element) return;

        requestAnimationFrame(() => {
            // Header fixieren
            const thead = element.querySelector('thead');
            if (thead) {
                const tableRect = element.getBoundingClientRect();
                const scrolled = window.scrollY > tableRect.top;
                thead.style.transform = scrolled ? 
                    `translateY(${window.scrollY - tableRect.top}px)` : '';
            }

            // Spaltenbreiten synchronisieren
            const headerCells = thead?.querySelectorAll('th');
            const bodyCells = element.querySelectorAll('tbody tr:first-child td');
            
            headerCells?.forEach((th, index) => {
                if (bodyCells[index]) {
                    const width = Math.max(
                        th.offsetWidth,
                        bodyCells[index].offsetWidth
                    );
                    th.style.width = `${width}px`;
                    bodyCells[index].style.width = `${width}px`;
                }
            });
        });
    }

    clearCache() {
        this.domCache.clear();
        this.dataCache.clear();
    }

    // Performance-Metriken
    measurePerformance() {
        return {
            cacheSize: this.domCache.size,
            deferredTasks: this.deferredTasks.size,
            renderQueueLength: this.renderQueue.length,
            memoryUsage: performance.memory?.usedJSHeapSize || 'Nicht verfügbar'
        };
    }
}

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    window.performanceOptimizer = new PerformanceOptimizer();
});

export default PerformanceOptimizer;