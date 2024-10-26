import { utils } from './main.js';
const { debounce, showError } = utils;

class FilterManager {
    constructor() {
        this.table = document.getElementById('studiesTable');
        this.globalSearch = document.getElementById('globalSearch');
        this.activeFilters = {};
        this.filterValues = {};
        this.filterMenus = {};
        this.columnMap = {
            'modalitaet': 'Modalität',
            'studiendatum': 'Studiendatum',
            'studienbeschreibung': 'Studienbeschreibung',
            'anfragename': 'Anfragename',
            'institution': 'Institution',
            'anfragende_abteilung': 'Anfragende Abteilung',
            'anfragender_arzt': 'Anfragender Arzt',
            'ueberweiser': 'Überweiser',
            'befundverfasser': 'Befundverfasser',
            'patientengeschlecht': 'Patientengeschlecht',
            'patientenalter': 'Patientenalter',
            'diagnose': 'Diagnose',
            'untersuchungsstatus': 'Untersuchungsstatus'
        };
        
        this.initializeFilters();
        this.setupEventListeners();
        this.loadStoredFilters();
    }

    initializeFilters() {
        const headers = this.table.querySelectorAll('th');
        headers.forEach(header => {
            const column = header.dataset.column;
            if (this.columnMap.hasOwnProperty(column)) {
                this.activeFilters[column] = new Set();
                this.createFilterMenu(header);
            } else {
                console.warn(`Unbekannte data-column: ${column}`);
            }
        });
    }

    createFilterMenu(header) {
        const column = header.dataset.column;
        const menu = document.createElement('div');
        menu.className = 'filter-menu glass-panel';
        menu.innerHTML = `
            <div class="filter-menu-header">
                <input type="text" class="filter-search" placeholder="Suchen in ${this.columnMap[column]}...">
                <div class="filter-button-group">
                    <button class="select-all">Alle</button>
                    <button class="select-none">Keine</button>
                </div>
            </div>
            <div class="filter-options"></div>
            <div class="filter-actions">
                <button class="apply-filter">Filter anwenden</button>
                <button class="clear-filter">Zurücksetzen</button>
            </div>
        `;

        document.body.appendChild(menu);
        this.filterMenus[column] = menu;

        // Event-Handler für Filtermenü
        const searchInput = menu.querySelector('.filter-search');
        searchInput.addEventListener('input', debounce((e) => {
            this.filterMenuOptions(column, e.target.value);
        }, 300));

        menu.querySelector('.select-all').addEventListener('click', () => {
            this.selectAllFilterOptions(column);
        });

        menu.querySelector('.select-none').addEventListener('click', () => {
            this.selectNoFilterOptions(column);
        });

        menu.querySelector('.apply-filter').addEventListener('click', () => {
            this.applyFilter(column);
            this.hideFilterMenu(column);
        });

        menu.querySelector('.clear-filter').addEventListener('click', () => {
            this.clearFilter(column);
            this.hideFilterMenu(column);
        });
    }

    setupEventListeners() {
        // Globale Suche
        this.globalSearch.addEventListener('input', debounce(() => {
            this.applyGlobalSearch();
        }, 300));

        // Filter-Button Klicks
        this.table.querySelectorAll('.filter-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const th = e.target.closest('th');
                const column = th.dataset.column;
                this.toggleFilterMenu(column, th);
                e.stopPropagation();
            });
        });

        // Menüs schließen bei Klick außerhalb
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-menu') && !e.target.closest('.filter-button')) {
                this.hideAllFilterMenus();
            }
        });

        // Doppelklick für Direktfilter
        this.table.querySelectorAll('th').forEach(th => {
            th.addEventListener('dblclick', (e) => {
                if (!e.target.classList.contains('filter-button') && 
                    !e.target.classList.contains('resize-handle')) {
                    this.showDirectFilterInput(th);
                }
            });
        });
    }

    toggleFilterMenu(column, th) {
        this.hideAllFilterMenus();
        const menu = this.filterMenus[column];
        
        if (menu.style.display === 'none' || !menu.style.display) {
            this.showFilterMenu(column, th);
        } else {
            this.hideFilterMenu(column);
        }
    }

    async showFilterMenu(column, th) {
        const menu = this.filterMenus[column];
        const rect = th.getBoundingClientRect();
        
        // Menüposition berechnen
        const viewportHeight = window.innerHeight;
        const menuHeight = 400; // Maximale Menühöhe
        let topPosition = rect.bottom;
        
        // Prüfen, ob Menü nach unten passt
        if (rect.bottom + menuHeight > viewportHeight) {
            topPosition = rect.top - menuHeight;
        }

        menu.style.position = 'fixed';
        menu.style.top = `${topPosition}px`;
        menu.style.left = `${rect.left}px`;
        menu.style.minWidth = `${rect.width}px`;
        menu.style.display = 'block';
        menu.classList.add('show');

        // Eindeutige Werte für die Spalte laden
        if (!this.filterValues[column]) {
            const values = new Set();
            this.table.querySelectorAll(`tbody tr:not([style*="display: none"]) td[data-column="${column}"]`).forEach(td => {
                if (td.textContent.trim()) {
                    values.add(td.textContent.trim());
                }
            });
            this.filterValues[column] = Array.from(values).sort((a, b) => {
                // Spezielle Sortierung für Datum und Alter
                if (column === 'studiendatum') {
                    return new Date(b) - new Date(a);
                }
                if (column === 'patientenalter') {
                    return parseInt(a) - parseInt(b);
                }
                return a.localeCompare(b, 'de');
            });
        }

        this.updateFilterOptions(column);
    }

    updateFilterOptions(column) {
        const optionsContainer = this.filterMenus[column].querySelector('.filter-options');
        optionsContainer.innerHTML = '';
        
        this.filterValues[column].forEach(value => {
            const option = document.createElement('label');
            option.className = 'filter-option';
            
            // Wert für die Anzeige formatieren
            let displayValue = value;
            if (column === 'patientenalter') {
                displayValue = value.replace('Y', ' Jahre');
            }

            const count = this.getValueCount(column, value);
            
            option.innerHTML = `
                <input type="checkbox" value="${value}" 
                    ${this.activeFilters[column].has(value) ? 'checked' : ''}>
                <span>${displayValue}</span>
                <span class="count">${count}</span>
            `;
            optionsContainer.appendChild(option);
        });
    }

    getValueCount(column, value) {
        let count = 0;
        this.table.querySelectorAll(`tbody tr:not([style*="display: none"]) td[data-column="${column}"]`).forEach(td => {
            if (td.textContent.trim() === value) count++;
        });
        
        return count;
    }

    hideFilterMenu(column) {
        const menu = this.filterMenus[column];
        menu.classList.remove('show');
        setTimeout(() => {
            menu.style.display = 'none';
        }, 200);
    }

    hideAllFilterMenus() {
        Object.values(this.filterMenus).forEach(menu => {
            menu.classList.remove('show');
            setTimeout(() => {
                menu.style.display = 'none';
            }, 200);
        });
    }

    filterMenuOptions(column, searchText) {
        const options = this.filterMenus[column].querySelectorAll('.filter-option');
        const searchLower = searchText.toLowerCase();
        
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            option.style.display = text.includes(searchLower) ? '' : 'none';
        });
    }

    selectAllFilterOptions(column) {
        const options = this.filterMenus[column].querySelectorAll('input[type="checkbox"]');
        options.forEach(option => option.checked = true);
    }

    selectNoFilterOptions(column) {
        const options = this.filterMenus[column].querySelectorAll('input[type="checkbox"]');
        options.forEach(option => option.checked = false);
    }

    applyFilter(column) {
        const selectedValues = new Set();
        this.filterMenus[column].querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
            selectedValues.add(checkbox.value);
        });

        this.activeFilters[column] = selectedValues;
        this.updateColumnHeader(column);
        this.applyAllFilters();
        this.saveFilters();
    }

    clearFilter(column) {
        this.activeFilters[column].clear();
        this.updateColumnHeader(column);
        this.applyAllFilters();
        this.saveFilters();
    }

    updateColumnHeader(column) {
        const th = this.table.querySelector(`th[data-column="${column}"]`);
        const hasActiveFilter = this.activeFilters[column].size > 0;
        th.classList.toggle('filtered', hasActiveFilter);
        
        if (hasActiveFilter) {
            th.setAttribute('title', `${this.activeFilters[column].size} Filter aktiv`);
        } else {
            th.removeAttribute('title');
        }
    }

    showDirectFilterInput(th) {
        const column = th.dataset.column;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'direct-filter-input';
        input.value = th.dataset.filterText || '';
        
        const originalContent = th.innerHTML;
        th.textContent = '';
        th.appendChild(input);
        input.focus();

        const applyDirectFilter = () => {
            const filterText = input.value.trim();
            th.innerHTML = originalContent;
            if (filterText) {
                this.activeFilters[column] = new Set([filterText]);
                th.dataset.filterText = filterText;
            } else {
                this.activeFilters[column].clear();
                delete th.dataset.filterText;
            }
            this.updateColumnHeader(column);
            this.applyAllFilters();
            this.saveFilters();
        };

        input.addEventListener('blur', applyDirectFilter);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyDirectFilter();
            } else if (e.key === 'Escape') {
                th.innerHTML = originalContent;
            }
        });
    }

    applyGlobalSearch() {
        const searchText = this.globalSearch.value.toLowerCase();
        const rows = this.table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            const matches = Array.from(row.cells).some(cell => 
                cell.textContent.toLowerCase().includes(searchText)
            );
            row.style.display = matches ? '' : 'none';
        });

        this.updateFilterValues();
    }

    applyAllFilters() {
        const rows = this.table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            let shouldShow = true;
            
            for (const [column, selectedValues] of Object.entries(this.activeFilters)) {
                if (selectedValues.size > 0) {
                    const cell = row.querySelector(`td[data-column="${column}"]`);
                    const cellValue = cell ? cell.textContent.trim() : '';
                    
                    if (!selectedValues.has(cellValue)) {
                        shouldShow = false;
                        break;
                    }
                }
            }
            
            row.style.display = shouldShow ? '' : 'none';
        });

        this.updateFilterValues();
    }

    updateFilterValues() {
        Object.keys(this.filterValues).forEach(column => {
            this.filterValues[column] = null; // Cache zurücksetzen
        });
    }

    saveFilters() {
        const filtersToSave = {};
        Object.entries(this.activeFilters).forEach(([column, values]) => {
            filtersToSave[column] = Array.from(values);
        });
        localStorage.setItem('tableFilters', JSON.stringify(filtersToSave));
    }

    loadStoredFilters() {
        try {
            const savedFilters = localStorage.getItem('tableFilters');
            if (savedFilters) {
                const filters = JSON.parse(savedFilters);
                Object.entries(filters).forEach(([column, values]) => {
                    if (this.columnMap.hasOwnProperty(column)) {
                        this.activeFilters[column] = new Set(values);
                        this.updateColumnHeader(column);
                    }
                });
                this.applyAllFilters();
            }
        } catch (error) {
            console.error('Fehler beim Laden der gespeicherten Filter:', error);
            localStorage.removeItem('tableFilters');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.filterManager = new FilterManager();
});

export default FilterManager;