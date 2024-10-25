// Konstanten und Konfiguration
const API_BASE_URL = window.location.origin;
const DEBOUNCE_DELAY = 300;
const SCROLL_THRESHOLD = 200;

// Cache für DOM-Elemente
const domCache = {
    elements: new Map(),
    get(selector) {
        if (!this.elements.has(selector)) {
            this.elements.set(selector, document.querySelector(selector));
        }
        return this.elements.get(selector);
    },
    clear() {
        this.elements.clear();
    }
};

// Utility Funktionen
export const formatDate = (dateStr) => {
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    } catch (error) {
        console.error('Fehler beim Formatieren des Datums:', error);
        return dateStr;
    }
};

export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const debounce = (func, wait = DEBOUNCE_DELAY) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

export const showError = (message, duration = 5000) => {
    const errorElement = domCache.get('#errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.classList.add('show');
    
    setTimeout(() => {
        errorElement.classList.remove('show');
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 300);
    }, duration);
};

export const showSuccess = (message, duration = 3000) => {
    const successElement = document.createElement('div');
    successElement.className = 'success-message glass-panel';
    successElement.textContent = message;
    document.body.appendChild(successElement);
    
    setTimeout(() => {
        successElement.remove();
    }, duration);
};

// API Funktionen
export const fetchStudies = async (page = 0) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/studies?page=${page}`);
        if (!response.ok) {
            throw new Error('Fehler beim Laden der Daten');
        }
        return await response.json();
    } catch (error) {
        showError('Fehler beim Laden der Daten: ' + error.message);
        return [];
    }
};

// Event Handler für Back-to-Top Button
const setupBackToTop = () => {
    const button = domCache.get('#backToTop');
    
    const toggleButton = () => {
        button.style.display = window.scrollY > SCROLL_THRESHOLD ? 'block' : 'none';
    };

    button.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    window.addEventListener('scroll', debounce(toggleButton));
};

// Responsive Design Anpassungen
const setupResponsive = () => {
    const checkScreenSize = () => {
        const width = window.innerWidth;
        document.body.classList.remove('desktop', 'tablet', 'mobile');
        
        if (width >= 1024) {
            document.body.classList.add('desktop');
        } else if (width >= 768) {
            document.body.classList.add('tablet');
        } else {
            document.body.classList.add('mobile');
        }
    };

    window.addEventListener('resize', debounce(checkScreenSize));
    checkScreenSize();
};

// Service Worker Registration
const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('ServiceWorker registriert:', registration);
        } catch (error) {
            console.error('ServiceWorker Registrierung fehlgeschlagen:', error);
        }
    }
};

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    setupBackToTop();
    setupResponsive();
    registerServiceWorker();
});

// Export der gemeinsam genutzten Funktionen
export const utils = {
    API_BASE_URL,
    formatDate,
    formatFileSize,
    showError,
    showSuccess,
    debounce,
    domCache
};

export default utils;