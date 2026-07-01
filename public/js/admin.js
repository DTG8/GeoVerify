/**
 * GeoVerify - Admin Portal Logic
 * Handles passcode authentication, renders statistics, timeline/pie charts,
 * interactive visitor map, and visit log table with search/export capabilities.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Elements
  const authOverlay = document.getElementById('auth-overlay');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const passcodeInput = document.getElementById('admin-passcode');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const searchInput = document.getElementById('log-search');
  const countryFilter = document.getElementById('country-filter');
  const logsTableBody = document.getElementById('logs-table-body');
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');
  const currentPageNum = document.getElementById('current-page-num');
  const paginationInfo = document.getElementById('pagination-info');

  // Stats Elements
  const statTotalVisits = document.getElementById('stat-total-visits');
  const statUniqueIps = document.getElementById('stat-unique-ips');
  const statCountries = document.getElementById('stat-countries');
  const statActiveRate = document.getElementById('stat-active-rate');
  const mapPinCount = document.getElementById('map-pin-count');

  // Dashboard State
  let adminPasscode = '';
  let allVisits = [];
  let filteredVisits = [];
  let adminMap = null;
  let mapMarkers = [];
  
  // Pagination State
  let currentPage = 1;
  const recordsPerPage = 10;

  // Chart References
  let timelineChart = null;
  let countriesChart = null;
  let browsersChart = null;
  let osChart = null;

  // HSL Chart colors (curated palettes for premium look - matching OneData green/teal branding)
  const chartColors = [
    '#00bcd4', // brand cyan
    '#00e676', // brand green
    '#80e27e', // soft green
    '#4db6ac', // teal-green
    '#00acc1', // dark cyan
    '#a7f3d0', // mint
    '#01546f'  // brand teal
  ];

  // 1. Auth Flow
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passcodeInput.value;
    
    try {
      const response = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        adminPasscode = password;
        localStorage.setItem('geo_admin_passcode', password);
        loginError.classList.add('hidden');
        authOverlay.classList.add('hidden');
        dashboard.classList.remove('hidden');
        initializeDashboard();
      } else {
        loginError.classList.remove('hidden');
        passcodeInput.value = '';
      }
    } catch (err) {
      console.error('Login error:', err);
      loginError.textContent = 'Server connection failed.';
      loginError.classList.remove('hidden');
    }
  });

  // Check existing session
  const storedPasscode = localStorage.getItem('geo_admin_passcode');
  if (storedPasscode) {
    adminPasscode = storedPasscode;
    // Attempt auto-login
    fetch('/api/visits', {
      headers: { 'x-admin-password': adminPasscode }
    }).then(res => {
      if (res.ok) {
        authOverlay.classList.add('hidden');
        dashboard.classList.remove('hidden');
        initializeDashboard();
      } else {
        // Token expired or invalid
        localStorage.removeItem('geo_admin_passcode');
        authOverlay.classList.remove('hidden');
      }
    }).catch(() => {
      authOverlay.classList.remove('hidden');
    });
  } else {
    authOverlay.classList.remove('hidden');
  }

  // Logout
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('geo_admin_passcode');
    adminPasscode = '';
    allVisits = [];
    filteredVisits = [];
    dashboard.classList.add('hidden');
    authOverlay.classList.remove('hidden');
    passcodeInput.value = '';
    
    // Clear map and charts
    if (adminMap) {
      adminMap.remove();
      adminMap = null;
    }
  });

  // 2. Initialize Dashboard
  async function initializeDashboard() {
    await fetchAnalyticsData();
    initAdminMap();
    renderDashboardComponents();
  }

  async function fetchAnalyticsData() {
    try {
      const response = await fetch('/api/visits', {
        headers: { 'x-admin-password': adminPasscode }
      });
      
      if (response.status === 401) {
        // Unauthorized
        logoutBtn.click();
        return;
      }
      
      const data = await response.json();
      allVisits = data.visits || [];
      filteredVisits = [...allVisits];
    } catch (error) {
      console.error('Error fetching visits logs:', error);
    }
  }

  function renderDashboardComponents() {
    calculateStats();
    populateCountryFilter();
    updateCharts();
    updateMapPins();
    currentPage = 1;
    renderTable();
  }

  // 3. Stats Calculations
  function calculateStats() {
    statTotalVisits.textContent = allVisits.length;
    
    // Unique IPs
    const uniqueIps = new Set(allVisits.map(v => v.ip));
    statUniqueIps.textContent = uniqueIps.size;
    
    // Unique Countries
    const uniqueCountries = new Set(allVisits.map(v => v.country).filter(c => c && c !== 'Unknown'));
    statCountries.textContent = uniqueCountries.size;

    // Daily average
    if (allVisits.length === 0) {
      statActiveRate.textContent = '0';
      return;
    }

    const timestamps = allVisits.map(v => new Date(v.timestamp).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    
    const oneDayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((maxTime - minTime) / oneDayMs) || 1;
    const avg = (allVisits.length / diffDays).toFixed(1);
    
    statActiveRate.textContent = avg;
  }

  // 4. Populate Country Dropdown
  function populateCountryFilter() {
    const countries = [...new Set(allVisits.map(v => v.country).filter(Boolean))].sort();
    
    // Clear and keep "All Countries"
    countryFilter.innerHTML = '<option value="">All Countries</option>';
    
    countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country;
      option.textContent = country;
      countryFilter.appendChild(option);
    });
  }

  // 5. Admin Map
  function initAdminMap() {
    if (adminMap) return;
    
    // Center map around a neutral location initially
    adminMap = L.map('admin-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(adminMap);
  }

  function updateMapPins() {
    if (!adminMap) return;

    // Clear existing markers
    mapMarkers.forEach(marker => adminMap.removeLayer(marker));
    mapMarkers = [];

    let pinCount = 0;

    // Place markers for matches with valid coordinates
    filteredVisits.forEach(visit => {
      if (visit.latitude && visit.longitude) {
        pinCount++;
        const dateStr = new Date(visit.timestamp).toLocaleString();
        
        const popupContent = `
          <div class="map-popup-bubble" style="color: #080710; font-family: 'Outfit', sans-serif; max-width: 240px;">
            <strong style="font-size: 1.05rem; color: #141228; display: block; margin-bottom: 4px;">${visit.ip}</strong>
            <span style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 2px;">📍 ${visit.city ? visit.city + ', ' : ''}${visit.country}</span>
            ${visit.fullAddress ? `<span style="font-size: 0.75rem; color: #555; display: block; margin-bottom: 4px; border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 4px;">🏡 ${visit.fullAddress}</span>` : ''}
            <span style="color: #666; font-size: 0.75rem; display: block; margin-bottom: 2px; ${visit.fullAddress ? '' : 'border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 4px;'}">⏰ ${dateStr}</span>
            <span style="color: #5856d6; font-size: 0.75rem; display: block;">🌐 ${visit.browser} on ${visit.os}</span>
          </div>
        `;

        const marker = L.marker([visit.latitude, visit.longitude])
          .addTo(adminMap)
          .bindPopup(popupContent);
        
        mapMarkers.push(marker);
      }
    });

    mapPinCount.textContent = `${pinCount} Pins`;

    // Fit map bounds to show all markers if any exist
    if (mapMarkers.length > 0) {
      const group = new L.featureGroup(mapMarkers);
      adminMap.fitBounds(group.getBounds().pad(0.1));
    }
  }

  // 6. Analytics Charts
  function updateCharts() {
    renderTimelineChart();
    renderPieChart('countries-chart', 'country', (val) => val, 'Top Countries', (ref) => countriesChart = ref);
    renderPieChart('browsers-chart', 'browser', (val) => val, 'Top Browsers', (ref) => browsersChart = ref);
    renderPieChart('os-chart', 'os', (val) => val, 'OS Share', (ref) => osChart = ref);
  }

  // Line Chart: Visits over time
  function renderTimelineChart() {
    if (timelineChart) {
      timelineChart.destroy();
    }

    // Group visits by date (local date)
    const dateGroups = {};
    
    // Seed last 7 days to make sure we show a proper line timeline
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      dateGroups[dateStr] = 0;
    }

    allVisits.forEach(visit => {
      const dateStr = new Date(visit.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (dateGroups[dateStr] !== undefined) {
        dateGroups[dateStr]++;
      } else {
        // If visit falls out of last 7 days but is valid, we can log it, or just ignore for standard window
        dateGroups[dateStr] = (dateGroups[dateStr] || 0) + 1;
      }
    });

    const labels = Object.keys(dateGroups);
    const data = Object.values(dateGroups);

    const ctx = document.getElementById('timeline-chart').getContext('2d');
    timelineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Visits',
          data,
          borderColor: '#00bcd4',
          backgroundColor: 'rgba(0, 188, 212, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#00bcd4',
          pointBorderColor: '#fff',
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { 
              color: '#9ca3af', 
              font: { family: 'Outfit' },
              stepSize: 1,
              precision: 0 
            }
          }
        }
      }
    });
  }

  // Generic Doughnut Chart Renderer
  function renderPieChart(canvasId, propertyName, labelFormatter, title, storeRef) {
    // Get existing chart ref
    const element = document.getElementById(canvasId);
    if (!element) return;
    
    // Destroy previous Chart instance
    const chartInstance = Chart.getChart(element);
    if (chartInstance) {
      chartInstance.destroy();
    }

    // Count property frequencies
    const counts = {};
    allVisits.forEach(v => {
      const val = v[propertyName] || 'Unknown';
      counts[val] = (counts[val] || 0) + 1;
    });

    // Sort descending
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);

    // Group elements beyond index 5 into "Other"
    let labels = [];
    let data = [];
    
    if (sorted.length > 5) {
      const topItems = sorted.slice(0, 4);
      const otherCount = sorted.slice(4).reduce((sum, item) => sum + item[1], 0);
      
      labels = topItems.map(item => labelFormatter(item[0]));
      data = topItems.map(item => item[1]);
      
      labels.push('Other');
      data.push(otherCount);
    } else {
      labels = sorted.map(item => labelFormatter(item[0]));
      data = sorted.map(item => item[1]);
    }

    // If no data
    if (data.length === 0) {
      labels = ['No Data'];
      data = [1];
    }

    const ctx = element.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: data.length === 1 && labels[0] === 'No Data' ? ['rgba(255, 255, 255, 0.05)'] : chartColors,
          borderColor: 'rgba(20, 18, 40, 0.9)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#9ca3af',
              font: { family: 'Outfit', size: 11 },
              boxWidth: 12
            }
          }
        },
        cutout: '70%'
      }
    });

    storeRef(chart);
  }

  // 7. Render Logs Table with Pagination
  function renderTable() {
    logsTableBody.innerHTML = '';

    if (filteredVisits.length === 0) {
      logsTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="loading-td">No logs found matching filters.</td>
        </tr>
      `;
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      paginationInfo.textContent = 'Showing 0-0 of 0 logs';
      return;
    }

    const totalRecords = filteredVisits.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    
    // Keep page bounds
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = Math.min(startIndex + recordsPerPage, totalRecords);
    const paginatedSlice = filteredVisits.slice(startIndex, endIndex);

    currentPageNum.textContent = currentPage;
    paginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalRecords} logs`;

    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;

    // Convert iso country code to emoji flag helper
    function getFlagEmoji(countryCode) {
      if (!countryCode || countryCode === 'Unknown' || countryCode.length !== 2) return '📍';
      const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
      try {
        return String.fromCodePoint(...codePoints);
      } catch (e) {
        return '📍';
      }
    }

    paginatedSlice.forEach(visit => {
      const tr = document.createElement('tr');
      const dateStr = new Date(visit.timestamp).toLocaleString();
      
      const badgeClass = `device-badge badge-${visit.device.toLowerCase()}`;
      const flag = getFlagEmoji(visit.countryCode);
      const flagText = visit.city !== 'Unknown' ? `${flag} ${visit.city}, ${visit.countryCode}` : `${flag} ${visit.country}`;
      const addressHtml = visit.fullAddress ? `<div style="font-size: 0.75rem; color: var(--text-muted); white-space: normal; max-width: 260px; margin-top: 4px;" title="${visit.fullAddress}">${visit.fullAddress}</div>` : '';
      
      tr.innerHTML = `
        <td>${dateStr}</td>
        <td style="font-weight: 600;">${visit.ip}</td>
        <td>
          <div style="font-weight: 600;">${flagText}</div>
          ${addressHtml}
        </td>
        <td>${visit.isp}</td>
        <td>
          <span class="browser-badge">${visit.browser}</span>
          <span class="os-badge">${visit.os}</span>
        </td>
        <td><span class="${badgeClass}">${visit.device}</span></td>
        <td>
          ${visit.latitude && visit.longitude ? `
            <button class="action-btn view-location-btn" data-lat="${visit.latitude}" data-lon="${visit.longitude}" data-ip="${visit.ip}">
              <i data-lucide="map-pin"></i>
              <span>Locate</span>
            </button>
          ` : '<span style="color: var(--text-muted);">N/A</span>'}
        </td>
      `;

      logsTableBody.appendChild(tr);
    });

    // Re-initialize Lucide Icons on dynamic elements
    lucide.createIcons();

    // Map locate button listeners
    document.querySelectorAll('.view-location-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lat = parseFloat(btn.dataset.lat);
        const lon = parseFloat(btn.dataset.lon);
        const ip = btn.dataset.ip;
        
        if (lat && lon && adminMap) {
          // Scroll to map
          document.getElementById('admin-map').scrollIntoView({ behavior: 'smooth' });
          adminMap.setView([lat, lon], 14);
          
          // Find matching marker and open popup
          const marker = mapMarkers.find(m => {
            const mLatLon = m.getLatLng();
            return mLatLon.lat === lat && mLatLon.lng === lon;
          });
          if (marker) {
            marker.openPopup();
          }
        }
      });
    });
  }

  // Pagination Handlers
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredVisits.length / recordsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });

  // 8. Filters & Search Actions
  function applyFilters() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const countryVal = countryFilter.value;

    filteredVisits = allVisits.filter(visit => {
      // 1. Search Query Match
      const matchesSearch = 
        visit.ip.toLowerCase().includes(searchVal) ||
        visit.country.toLowerCase().includes(searchVal) ||
        visit.city.toLowerCase().includes(searchVal) ||
        visit.isp.toLowerCase().includes(searchVal) ||
        visit.browser.toLowerCase().includes(searchVal) ||
        visit.os.toLowerCase().includes(searchVal);
      
      // 2. Country Filter Match
      const matchesCountry = !countryVal || visit.country === countryVal;

      return matchesSearch && matchesCountry;
    });

    currentPage = 1;
    renderTable();
    updateMapPins();
  }

  searchInput.addEventListener('input', applyFilters);
  countryFilter.addEventListener('change', applyFilters);

  // 9. CSV Export Logic
  exportCsvBtn.addEventListener('click', () => {
    if (filteredVisits.length === 0) {
      alert('No data to export.');
      return;
    }

    const headers = ['Timestamp', 'IP Address', 'City', 'Country', 'Country Code', 'ISP', 'Latitude', 'Longitude', 'OS', 'Browser', 'Device', 'Screen Resolution', 'Timezone', 'Referrer'];
    
    const csvRows = [headers.join(',')];

    filteredVisits.forEach(v => {
      const row = [
        `"${new Date(v.timestamp).toISOString()}"`,
        `"${v.ip}"`,
        `"${v.city.replace(/"/g, '""')}"`,
        `"${v.country.replace(/"/g, '""')}"`,
        `"${v.countryCode}"`,
        `"${v.isp.replace(/"/g, '""')}"`,
        v.latitude || '',
        v.longitude || '',
        `"${v.os}"`,
        `"${v.browser}"`,
        `"${v.device}"`,
        `"${v.screenResolution}"`,
        `"${v.timezone}"`,
        `"${v.referrer.replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `visitor_analytics_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // 10. Clear Logs Logic
  clearLogsBtn.addEventListener('click', async () => {
    const confirmation = confirm('⚠️ WARNING: This will permanently delete ALL visitor logs. This action cannot be undone. Are you sure you want to proceed?');
    
    if (confirmation) {
      try {
        const response = await fetch('/api/clear-visits', {
          method: 'POST',
          headers: {
            'x-admin-password': adminPasscode
          }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
          alert('Logs cleared successfully.');
          initializeDashboard();
        } else {
          alert(`Failed to clear logs: ${result.error || 'Server error'}`);
        }
      } catch (err) {
        console.error('Error clearing logs:', err);
        alert('Server connection failed. Could not clear logs.');
      }
    }
  });
});
