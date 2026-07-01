/**
 * OneData GeoVerify - Client Application Logic
 * Detects IP, location, browser details, renders map, and logs the visit.
 * Includes interactive glassmorphic Welcome Modal and street-level precision GPS scanning.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  lucide.createIcons();

  // DOM Elements
  const loader = document.getElementById('loader');
  const mainContent = document.getElementById('main-content');
  const ipAddressEl = document.getElementById('ip-address');
  const ipVersionEl = document.getElementById('ip-version');
  const hostNameEl = document.getElementById('host-name');
  const locationTextEl = document.getElementById('location-text');
  const countryFlagEl = document.getElementById('country-flag');
  const regionTextEl = document.getElementById('region-text');
  const postalCodeEl = document.getElementById('postal-code');
  const latitudeEl = document.getElementById('latitude');
  const longitudeEl = document.getElementById('longitude');
  const ispNameEl = document.getElementById('isp-name');
  const asnTextEl = document.getElementById('asn-text');
  const deviceOsEl = document.getElementById('device-os');
  const deviceBrowserEl = document.getElementById('device-browser');
  const screenResolutionEl = document.getElementById('screen-resolution');
  const browserLanguageEl = document.getElementById('browser-language');
  const localTimezoneEl = document.getElementById('local-timezone');
  const localTimeEl = document.getElementById('local-time');
  const coordinatesBadge = document.getElementById('coordinates-badge');
  const copyIpBtn = document.getElementById('copy-ip');

  // Refine GPS elements
  const refineGpsBtn = document.getElementById('refine-gps-btn');
  const addressRow = document.getElementById('address-row');
  const fullAddressEl = document.getElementById('full-address');

  // Welcome Modal elements
  const welcomeModal = document.getElementById('welcome-modal');
  const welcomeMessage = document.getElementById('welcome-message');
  const modalLoaderBar = document.getElementById('modal-loader-bar');
  const welcomeActions = document.getElementById('welcome-actions');
  const modalVerifyBtn = document.getElementById('modal-verify-btn');
  const modalPreciseBtn = document.getElementById('modal-precise-btn');

  let map = null;
  let mapMarker = null;
  let loggedVisitId = null;
  let currentCountry = 'Nigeria';

  // 1. Live Local Time ticking
  function updateLocalTime() {
    const now = new Date();
    localTimeEl.textContent = now.toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  updateLocalTime();
  setInterval(updateLocalTime, 1000);

  // 2. Convert Country Code to Emoji Flag
  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode === 'Unknown' || countryCode.length !== 2) {
      return '📍';
    }
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

  // 3. Simple User-Agent detection on client-side for immediate display
  function getClientBrowserDetails() {
    const ua = navigator.userAgent;
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    // Simple OS
    if (ua.indexOf('Win') !== -1) os = 'Windows';
    else if (ua.indexOf('Mac') !== -1) os = 'macOS';
    else if (ua.indexOf('Linux') !== -1) os = 'Linux';
    else if (ua.indexOf('Android') !== -1) os = 'Android';
    else if (ua.indexOf('like Mac') !== -1) os = 'iOS';

    // Simple Browser
    if (ua.indexOf('Firefox') !== -1) browser = 'Firefox';
    else if (ua.indexOf('SamsungBrowser') !== -1) browser = 'Samsung Internet';
    else if (ua.indexOf('Opera') !== -1 || ua.indexOf('OPR') !== -1) browser = 'Opera';
    else if (ua.indexOf('Edge') !== -1 || ua.indexOf('Edg') !== -1) browser = 'Edge';
    else if (ua.indexOf('Chrome') !== -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') !== -1) browser = 'Safari';

    return { os, browser };
  }

  // 4. Initialize Leaflet Map
  function initMap(lat, lon, city) {
    if (map) {
      map.remove();
    }

    // Set up Leaflet Map instance
    map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([lat, lon], 12);

    // Load CartoDB Dark Matter tiles for beautiful dark aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    // Create a pulsing CSS marker
    const pulsingIcon = L.divIcon({
      className: 'custom-pulsing-marker',
      html: '<span class="pulse-marker"></span>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    // Add marker and popup
    mapMarker = L.marker([lat, lon], { icon: pulsingIcon })
      .addTo(map)
      .bindPopup(`<strong style="color: #080710;">Approximate Location</strong><br/><span style="color: #666;">${city}</span>`)
      .openPopup();
  }

  // 5. Close Welcome Modal helper
  function closeWelcomeModal() {
    welcomeModal.classList.add('fade-out');
    setTimeout(() => {
      welcomeModal.classList.add('hidden');
    }, 450);
  }

  // 6. Geolocation Detection with Fallbacks
  async function detectLocation() {
    let geoData = {};

    // Get client environmental variables
    const screenRes = `${window.screen.width} x ${window.screen.height}`;
    const browserLang = navigator.language || 'en-US';
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
    const clientUA = getClientBrowserDetails();

    // Populate environmental displays immediately
    deviceOsEl.textContent = clientUA.os;
    deviceBrowserEl.textContent = clientUA.browser;
    screenResolutionEl.textContent = screenRes;
    browserLanguageEl.textContent = browserLang;
    localTimezoneEl.textContent = localTz;

    try {
      // Primary API: ipapi.co (Works over HTTPS and provides ISP info)
      const response = await fetch('https://ipapi.co/json/');
      if (!response.ok) throw new Error('Primary GeoIP lookup failed');
      geoData = await response.json();
    } catch (primaryError) {
      console.warn('Primary GeoIP lookup failed, trying fallback API...', primaryError);
      
      try {
        // Fallback API: freeipapi.com
        const response = await fetch('https://freeipapi.com/api/json');
        if (!response.ok) throw new Error('Fallback GeoIP lookup failed');
        const fallbackRaw = await response.json();
        
        // Map fallback schema to match primary schema
        geoData = {
          ip: fallbackRaw.ipAddress,
          city: fallbackRaw.cityName,
          region: fallbackRaw.regionName,
          country_name: fallbackRaw.countryName,
          country_code: fallbackRaw.countryCode,
          latitude: fallbackRaw.latitude,
          longitude: fallbackRaw.longitude,
          postal: fallbackRaw.zipCode || 'Unknown',
          org: 'Unknown ISP'
        };
      } catch (fallbackError) {
        console.error('All client-side Geolocation APIs failed:', fallbackError);
        // Let server determine IP and details if client APIs are blocked/fail
        geoData = {
          ip: '',
          city: 'Unknown',
          region: 'Unknown',
          country_name: 'Unknown',
          country_code: 'Unknown',
          latitude: null,
          longitude: null,
          postal: 'Unknown',
          org: 'Unknown'
        };
      }
    }

    // Populate Geolocation UI
    const ip = geoData.ip || 'Unknown';
    const city = geoData.city || 'Unknown';
    const region = geoData.region || 'Unknown';
    const country = geoData.country_name || 'Unknown';
    const countryCode = geoData.country_code || '';
    const latitude = geoData.latitude ? parseFloat(geoData.latitude) : null;
    const longitude = geoData.longitude ? parseFloat(geoData.longitude) : null;
    const isp = geoData.org || geoData.asn || 'Unknown ISP';
    const postal = geoData.postal || 'Unknown';

    currentCountry = country;
    ipAddressEl.textContent = ip;
    ipVersionEl.textContent = ip.includes(':') ? 'IPv6' : 'IPv4';
    locationTextEl.textContent = city !== 'Unknown' ? `${city}, ${country}` : country;
    countryFlagEl.textContent = getFlagEmoji(countryCode);
    regionTextEl.textContent = region;
    postalCodeEl.textContent = postal;
    latitudeEl.textContent = latitude ? latitude.toFixed(4) : '-';
    longitudeEl.textContent = longitude ? longitude.toFixed(4) : '-';
    ispNameEl.textContent = isp;
    asnTextEl.textContent = geoData.asn || 'Unknown';
    hostNameEl.textContent = geoData.hostname || 'Unavailable';
    coordinatesBadge.textContent = latitude && longitude ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : '0.0000, 0.0000';

    // Show main layout & hide spinner
    loader.classList.add('hidden');
    mainContent.classList.remove('hidden');

    // Initialize Map if coordinates are available
    if (latitude && longitude) {
      setTimeout(() => {
        initMap(latitude, longitude, city);
      }, 100);
    } else {
      document.getElementById('map').innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); gap: 12px;">
          <i data-lucide="map-pin-off" style="width: 48px; height: 48px;"></i>
          <span>Map visualization unavailable: Location block or missing coordinates.</span>
        </div>
      `;
      lucide.createIcons({
        attrs: {
          class: 'lucide-custom'
        },
        nameAttr: 'data-lucide'
      });
    }

    // 6. Log Visit to Backend & Update Welcome Modal
    try {
      const logPayload = {
        ...geoData,
        screenResolution: screenRes,
        language: browserLang,
        timezone: localTz,
        referrer: document.referrer || 'Direct'
      };

      const response = await fetch('/api/log-visit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logPayload)
      });
      
      const logResult = await response.json();
      console.log('Visit logged to server:', logResult);
      if (logResult.success && logResult.visit) {
        loggedVisitId = logResult.visit.id;
      }
      
      // Update welcome modal text dynamically
      if (city !== 'Unknown') {
        welcomeMessage.innerHTML = `Hey there! Welcome to OneData GeoVerify. 🚀 We tracked your connection to the gateway near <strong>${city}, ${country}</strong>! This is where you are.`;
      } else {
        welcomeMessage.innerHTML = `Hey there! Welcome to OneData GeoVerify. 🚀 We tracked your connection to <strong>${country}</strong>. Let's verify your network properties.`;
      }
      
      modalLoaderBar.classList.add('hidden');
      welcomeActions.classList.remove('hidden');

    } catch (logError) {
      console.error('Failed to log visit to database:', logError);
      welcomeMessage.innerHTML = `Hey there! Welcome to OneData GeoVerify. 🚀 Let's verify your network gateway and exact street location.`;
      modalLoaderBar.classList.add('hidden');
      welcomeActions.classList.remove('hidden');
    }
  }

  // 7. Refine Location with HTML5 Geolocation API & Nominatim Reverse Geocoding
  function refineLocation(isAuto = false) {
    if (!navigator.geolocation) {
      if (!isAuto) alert("Geolocation is not supported by your browser.");
      return;
    }

    // Update button to loading state
    refineGpsBtn.disabled = true;
    refineGpsBtn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i><span>Locating...</span>';
    lucide.createIcons();

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
          // Fetch reverse geocode address from OpenStreetMap Nominatim
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
          if (!response.ok) throw new Error('Address lookup failed');
          const data = await response.json();
          
          const address = data.address || {};
          const displayName = data.display_name || '';

          // Parse descriptive neighborhood/suburb fields
          const suburb = address.suburb || address.neighbourhood || address.quarter || address.residential || address.subdivision || '';
          const cityDistrict = address.city_district || address.suburb || '';
          const cityTown = address.city || address.town || address.village || address.county || '';
          
          let neighborhood = suburb;
          if (cityDistrict && cityDistrict !== suburb) {
            neighborhood = neighborhood ? `${neighborhood}, ${cityDistrict}` : cityDistrict;
          }
          
          const cityLabel = cityTown || address.state || '';
          const localizedName = neighborhood ? `${neighborhood}, ${cityLabel}` : cityLabel;

          // Update Geolocation UI with exact details
          locationTextEl.textContent = localizedName ? `${localizedName}, ${currentCountry}` : currentCountry;
          latitudeEl.textContent = lat.toFixed(6);
          longitudeEl.textContent = lon.toFixed(6);
          coordinatesBadge.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

          // If Nominatim returns a zip code, update it
          if (address.postcode) {
            postalCodeEl.textContent = address.postcode;
          }

          // Show & update exact address row
          addressRow.classList.remove('hidden');
          fullAddressEl.textContent = displayName;

          // Update Map zoom and marker position
          if (map) {
            map.setView([lat, lon], 17); // Zoom close-up for street view
            
            if (mapMarker) {
              mapMarker.setLatLng([lat, lon]);
              mapMarker.setPopupContent(`
                <strong style="color: #080710; font-family: 'Outfit';">Exact Location</strong><br/>
                <span style="color: #5856d6; font-size: 0.8rem; font-weight: 500;">${localizedName}</span><br/>
                <span style="color: #777; font-size: 0.75rem;">${displayName.substring(0, 45)}...</span>
              `);
              mapMarker.openPopup();
            }
          }

          // Update button to success state
          refineGpsBtn.disabled = true;
          refineGpsBtn.innerHTML = '<i data-lucide="check-circle"></i><span>Location Refined</span>';
          lucide.createIcons();

          // Send refined address log to database
          if (loggedVisitId) {
            const updatePayload = {
              id: loggedVisitId,
              latitude: lat,
              longitude: lon,
              city: localizedName,
              fullAddress: displayName
            };

            const updateResponse = await fetch('/api/log-visit', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updatePayload)
            });
            const updateResult = await updateResponse.json();
            console.log('Visit log updated with exact GPS address:', updateResult);
          }

        } catch (error) {
          console.error('Error reverse geocoding coordinates:', error);
          refineGpsBtn.disabled = false;
          refineGpsBtn.innerHTML = '<i data-lucide="rotate-ccw"></i><span>Retry Precise Scan</span>';
          lucide.createIcons();
          if (!isAuto) alert("Failed to retrieve street address. Please click retry.");
        }
      },
      (error) => {
        console.warn('Geolocation permission or API failed:', error);
        refineGpsBtn.disabled = false;
        
        let btnText = 'Find Precise Address';
        if (error.code === error.PERMISSION_DENIED) {
          btnText = 'GPS Access Denied';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          btnText = 'GPS Signal Lost';
        } else if (error.code === error.TIMEOUT) {
          btnText = 'GPS Timeout';
        }

        refineGpsBtn.innerHTML = `<i data-lucide="alert-triangle"></i><span>${btnText}</span>`;
        lucide.createIcons();

        if (!isAuto && error.code === error.PERMISSION_DENIED) {
          alert("Location access was denied. Please check your browser/site permission settings to enable exact address matching.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  // 8. Clipboard Copy Functionality
  copyIpBtn.addEventListener('click', () => {
    const ipText = ipAddressEl.textContent;
    if (ipText && ipText !== '0.0.0.0' && ipText !== 'Unknown') {
      navigator.clipboard.writeText(ipText).then(() => {
        // Change icon to check
        copyIpBtn.innerHTML = '<i data-lucide="check" style="color: var(--accent-cyan);"></i>';
        lucide.createIcons();
        
        // Revert icon after 2 seconds
        setTimeout(() => {
          copyIpBtn.innerHTML = '<i data-lucide="copy"></i>';
          lucide.createIcons();
        }, 2000);
      }).catch(err => {
        console.error('Could not copy text: ', err);
      });
    }
  });

  // Welcome Modal Action Buttons
  modalVerifyBtn.addEventListener('click', () => {
    closeWelcomeModal();
  });

  modalPreciseBtn.addEventListener('click', () => {
    closeWelcomeModal();
    // Delay slightly to allow modal fade out transition to complete smoothly
    setTimeout(() => {
      refineLocation(false);
    }, 300);
  });

  // Attach Refine Button Listener on location card
  refineGpsBtn.addEventListener('click', () => refineLocation(false));

  // Start Detection
  detectLocation();
});
