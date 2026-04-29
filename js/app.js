// --- API CONFIGURATION ---
// ⚠️  SECURITY: Restrict this key in Google Cloud Console → APIs & Services → Credentials.
// Set "HTTP referrers" to your installer portal domain to prevent unauthorised billing.
const GOOGLE_MAPS_API_KEY = "AIzaSyCXfCBJcgzT5SflauWFayjp9gsnjsQnsLg";
// -------------------------

// Load Google Maps JS API Dynamically
function loadGoogleMapsAPI() {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=initAutocomplete`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

// DOM Elements
const dashboard = document.getElementById('dashboard');
const results = document.getElementById('results');
const addressInput = document.getElementById('address-input');
const spinnerContainer = document.getElementById('loading-spinner-container');
const backBtn = document.getElementById('back-btn');
const gridRateInput = document.getElementById('grid-rate');

let chartInstance = null;
let currentData = null;

let pw3Count = 1;
let expCount = 0;
let hasGateway = true;

let currentChartType = 'production';
let roiData = [];
let quoteRecordedForCurrentSearch = false;

let confirmationMap = null;
let confirmationMarker = null;

// Number Animation Utility
function animateValue(obj, start, end, duration, isFloat = false) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        let current = start + (end - start) * easeProgress;

        if (isFloat) {
            obj.textContent = current.toFixed(1);
        } else {
            obj.textContent = Math.floor(current).toLocaleString();
        }

        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// --- Dashboard Stats (localStorage-backed) ---
function updateDashboardStats() {
    const stats = JSON.parse(localStorage.getItem('pwp_stats') || '{"quotes":0,"pipeline":0,"totalKwp":0,"totalSavings":0}');
    const qEl = document.getElementById('stat-quotes');
    const pEl = document.getElementById('stat-pipeline');
    const sEl = document.getElementById('stat-avg-size');
    const aEl = document.getElementById('stat-avg-savings');
    if (qEl) qEl.textContent = stats.quotes;
    if (pEl) { const p = stats.pipeline; pEl.textContent = p >= 1000 ? '\u00a3' + (p / 1000).toFixed(0) + 'k' : '\u00a3' + p; }
    if (sEl) sEl.textContent = stats.quotes > 0 ? (stats.totalKwp / stats.quotes).toFixed(1) + ' kWp' : '0 kWp';
    if (aEl) aEl.textContent = stats.quotes > 0 ? '\u00a3' + Math.round(stats.totalSavings / stats.quotes).toLocaleString() : '\u00a30';
}

function recordQuote(systemCost, kwp, annualSavings) {
    if (quoteRecordedForCurrentSearch) return; // Only record once per unique search
    
    const stats = JSON.parse(localStorage.getItem('pwp_stats') || '{"quotes":0,"pipeline":0,"totalKwp":0,"totalSavings":0}');
    stats.quotes++;
    stats.pipeline += systemCost;
    stats.totalKwp += kwp;
    stats.totalSavings += annualSavings;
    localStorage.setItem('pwp_stats', JSON.stringify(stats));
    updateDashboardStats();
    quoteRecordedForCurrentSearch = true;
}

// Configurator UI Logic
function updateConfigUI() {
    document.getElementById('pw3-count').textContent = pw3Count;
    document.getElementById('exp-count').textContent = expCount;

    const totalUnits = pw3Count + expCount;
    const totalCapacity = (totalUnits * 13.5).toFixed(1);
    document.getElementById('total-capacity').textContent = totalCapacity;

    if (currentData) {
        calculateFinancials();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateDashboardStats();
    document.getElementById('pw3-minus').addEventListener('click', () => {
        if (pw3Count > 1) { pw3Count--; updateConfigUI(); }
    });
    document.getElementById('pw3-plus').addEventListener('click', () => {
        if (pw3Count < 4) { pw3Count++; updateConfigUI(); }
    });
    document.getElementById('exp-minus').addEventListener('click', () => {
        if (expCount > 0) { expCount--; updateConfigUI(); }
    });
    document.getElementById('exp-plus').addEventListener('click', () => {
        if (expCount < 3 * pw3Count) { expCount++; updateConfigUI(); }
    });
    document.getElementById('gateway-toggle').addEventListener('change', (e) => {
        hasGateway = e.target.checked;
        updateConfigUI();
    });
});

// Initialize Autocomplete
function initAutocomplete() {
    const autocomplete = new google.maps.places.Autocomplete(addressInput, {
        componentRestrictions: { country: "uk" }, // Restrict to UK
        fields: ["formatted_address", "geometry", "name"],
    });

    // When user selects an address
    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            alert("No details available for input: '" + place.name + "'");
            return;
        }

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address;

        showConfirmationMap(lat, lng, address);
    });
}

function showConfirmationMap(lat, lng, address) {
    dashboard.classList.add('hidden-section');
    const confirmSection = document.getElementById('confirm-location');
    confirmSection.classList.remove('hidden-section');
    confirmSection.classList.add('slide-in');

    const mapOptions = {
        center: { lat, lng },
        zoom: 20,
        mapTypeId: 'satellite',
        tilt: 0, // 0 for accurate overhead placement, but we can enable 45 for 'cool' factor
        heading: 0,
        disableDefaultUI: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    };

    confirmationMap = new google.maps.Map(document.getElementById('confirmation-map'), mapOptions);

    confirmationMarker = new google.maps.Marker({
        position: { lat, lng },
        map: confirmationMap,
        draggable: true,
        animation: google.maps.Animation.DROP,
        icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: "#E31937",
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: "#FFFFFF",
        },
        title: "Drag to center of roof"
    });

    const confirmBtn = document.getElementById('confirm-analyze-btn');
    confirmBtn.onclick = () => {
        const pos = confirmationMarker.getPosition();
        fetchSolarData(pos.lat(), pos.lng(), address);
        confirmSection.classList.add('hidden-section');
    };
}

document.getElementById('cancel-confirm-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-location').classList.add('hidden-section');
    dashboard.classList.remove('hidden-section');
});

function toggleSkeletons(show) {
    const elements = document.querySelectorAll('.card-container');
    elements.forEach(el => {
        if (show) {
            el.classList.add('skeleton');
        } else {
            el.classList.remove('skeleton');
        }
    });
    // Hide chart canvas during skeleton
    const chartCanvas = document.getElementById('productionChart');
    if (chartCanvas) chartCanvas.style.opacity = show ? '0' : '1';
}

// Call Google Solar API
async function fetchSolarData(lat, lng, address) {
    spinnerContainer.classList.remove('hidden');
    addressInput.disabled = true;

    // Show Results section immediately with Skeletons
    dashboard.classList.add('hidden-section');
    results.classList.remove('hidden-section');
    results.classList.add('slide-in');
    toggleSkeletons(true);

    try {
        // 1. Hit Google Solar API directly
        const solarUrl = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${GOOGLE_MAPS_API_KEY}`;

        let data = {
            address: address,
            lat: lat,
            lng: lng,
            isMock: false
        };

        const response = await fetch(solarUrl);

        if (response.ok) {
            const solarData = await response.json();

            // Parse real solar data
            const configs = solarData.solarPotential.solarPanelConfigs;
            const maxConfig = configs[configs.length - 1]; // usually the largest config

            const panels = maxConfig.panelsCount;
            // FIX #1: Use the wattage the user has selected, not a hardcoded 400W
            const selectedWattage = parseInt(document.getElementById('panel-wattage')?.value) || 400;
            const kwp = (panels * selectedWattage) / 1000;
            const roofArea = solarData.solarPotential.maxArrayAreaMeters2;

            // Google provides yearly energy per panel. Build monthly curve from total.
            const totalKwh = maxConfig.yearlyEnergyDcKwh;

            // FIX #5: Accurate UK irradiance distribution (PVGIS-derived, sums to 1.0)
            const monthWeights = [0.033, 0.050, 0.080, 0.105, 0.130, 0.140, 0.135, 0.115, 0.085, 0.055, 0.035, 0.037];
            const production = monthWeights.map(w => Math.round(totalKwh * w));

            const segments = solarData.solarPotential.roofSegmentStats;
            const panelsList = maxConfig.solarPanels;

            data = { 
                ...data, 
                panels, 
                kwp, 
                roofArea, 
                totalKwh, 
                production, 
                baseTotalKwh: totalKwh, 
                baseProduction: production, 
                basePanels: panels,
                panelsList: panelsList,
                segments: segments
            };
        } else {
            console.log("Google Solar API failed or not enabled. Falling back to mock data.");
            // Fallback generator
            const panels = Math.floor(Math.random() * 8) + 8;
            const selectedWattage = parseInt(document.getElementById('panel-wattage')?.value) || 400;
            const kwp = (panels * selectedWattage) / 1000;
            const roofArea = panels * 2.2;
            const production = [
                kwp * 30, kwp * 45, kwp * 80, kwp * 110, kwp * 140, kwp * 150,
                kwp * 145, kwp * 130, kwp * 95, kwp * 65, kwp * 40, kwp * 25
            ].map(v => Math.round(v));
            const totalKwh = production.reduce((a, b) => a + b, 0);

            data = { ...data, panels, kwp, roofArea, totalKwh, production, isMock: true, baseTotalKwh: totalKwh, baseProduction: production, basePanels: panels };
        }

        currentData = data;
        quoteRecordedForCurrentSearch = false; // reset so new address records a new quote

        // Add an artificial small delay for effect if API returns too fast
        setTimeout(() => {
            toggleSkeletons(false);
            populateResults(data);
        }, 800);

    } catch (error) {
        alert("Error analyzing property. " + error.message);
        console.error(error);
    } finally {
        spinnerContainer.classList.add('hidden');
        addressInput.disabled = false;
    }
}

// Back Button
backBtn.addEventListener('click', () => {
    results.classList.add('hidden-section');
    results.classList.remove('slide-in');
    dashboard.classList.remove('hidden-section');
    addressInput.value = '';
    addressInput.focus();
});

// Populate Results
function populateResults(data) {
    document.getElementById('res-address').textContent = data.address;
    document.getElementById('res-coords').textContent = `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`;

    // Animated Counters
    const kwpEl = document.getElementById('res-kwp');
    const panelsEl = document.getElementById('res-panels');
    const kwhEl = document.getElementById('res-kwh');

    animateValue(kwpEl, 0, typeof data.kwp === 'number' ? data.kwp : parseFloat(data.kwp), 1500, true);
    animateValue(panelsEl, 0, parseInt(data.panels), 1500, false);

    document.getElementById('res-roof').textContent = `${Math.round(data.roofArea)} m²`;

    animateValue(kwhEl, 0, Math.round(data.totalKwh), 1500, false);

    const slider = document.getElementById('panel-slider');
    const sliderMax = document.getElementById('slider-max-label');
    if (slider && !data.isMock) {
        if (slider.max != data.basePanels) {
            slider.max = data.basePanels || data.panels;
            slider.value = data.panels;
            if (sliderMax) sliderMax.textContent = `Max (${slider.max})`;
        }
    } else if (slider) {
        slider.max = data.panels;
        slider.value = data.panels;
        if (sliderMax) sliderMax.textContent = `Max (${data.panels})`;
    }

    // Set Satellite Image using Canvas for Overlay
    const satCanvas = document.getElementById('satellite-canvas');
    const satImg = document.getElementById('satellite-img');
    
    satImg.onload = () => {
        drawPanelsOnRoof(data.panels);
    };

    satImg.onerror = () => {
        satImg.src = 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&q=80&w=800&h=400';
        satImg.onerror = null;
    };
    
    // Zoom 20 is standard for solar analysis
    satImg.src = `https://maps.googleapis.com/maps/api/staticmap?center=${data.lat},${data.lng}&zoom=20&size=600x300&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`;

    if (currentChartType === 'production') {
        renderChart(data.production);
    } else {
        renderChart(roiData);
    }
    calculateFinancials();
}

// Financial Calculations
function calculateFinancials() {
    if (!currentData) return;

    const ratePence = parseFloat(gridRateInput.value) || 24.67;
    const ratePounds = ratePence / 100;

    const sellRatePence = parseFloat(document.getElementById('sell-rate').value) || 5.00;
    const exportRatePounds = sellRatePence / 100;
    const totalKwh = currentData.totalKwh;

    let annualUsage = parseFloat(document.getElementById('annual-usage').value) || 4000;
    if (document.getElementById('add-ev')?.checked) annualUsage += 3000;
    if (document.getElementById('add-hp')?.checked) annualUsage += 4000;

    const isOffPeak = document.getElementById('off-peak-toggle').checked;
    const offPeakRatePence = parseFloat(document.getElementById('off-peak-rate').value) || 7.50;
    const offPeakRatePounds = offPeakRatePence / 100;

    // --- Solar Only (direct daytime self-consumption) ---
    // UK base: ~30-38% of solar is used directly (daytime load coincidence)
    const directSCR = Math.min(0.38, (annualUsage * 0.45) / (totalKwh || 1));
    const solarUsed = totalKwh * directSCR;
    const solarExported = totalKwh * (1 - directSCR);
    const solarSavings = (solarUsed * ratePounds) + (solarExported * exportRatePounds);

    // --- With Powerwall (physically-grounded model) ---
    // Battery captures excess solar during the day and discharges in the evening.
    // UK realistic: ~220 discharge cycles/yr (mainly April-September).
    // Each cycle captures min(daily excess, battery capacity) at 90% round-trip efficiency.
    const batteryCapacity = (pw3Count + expCount) * 13.5;
    const avgDailyExcess = (totalKwh * (1 - directSCR)) / 365;
    const perCycleCapture = Math.min(avgDailyExcess, batteryCapacity) * 0.90;
    const annualBatteryShift = Math.min(perCycleCapture * 220, totalKwh * (1 - directSCR));
    const batteryBoost = annualBatteryShift / (totalKwh || 1);

    let pwSelfConsumption = directSCR + batteryBoost;
    // Physical cap: can't self-consume more than you generate or more than you consume
    const maxSCR = Math.min(0.92, annualUsage / (totalKwh || 1));
    if (pwSelfConsumption > maxSCR) pwSelfConsumption = maxSCR;

    let pwSavings = 0;

    if (isOffPeak) {
        // Off-peak benefit: self-consumption still applies (battery stores solar), BUT
        // remaining grid imports happen at the cheaper off-peak rate instead of peak.
        const pwUsed = totalKwh * pwSelfConsumption;
        const pwExported = Math.max(0, totalKwh - pwUsed);
        const gridStillNeeded = Math.max(0, annualUsage - pwUsed);

        // Baseline without system
        const baselineCost = annualUsage * ratePounds;
        // New effective cost: cheap off-peak imports minus export income
        const newCost = (gridStillNeeded * offPeakRatePounds) - (pwExported * exportRatePounds);
        pwSavings = Math.max(0, baselineCost - newCost);
    } else {
        const pwUsed = totalKwh * pwSelfConsumption;
        const pwExported = Math.max(0, totalKwh - pwUsed);
        pwSavings = (pwUsed * ratePounds) + (pwExported * exportRatePounds);
    }

    // FIX #10: UK market-rate solar pricing (panels + racking + DC wiring; inverter is in PW3)
    // Supply + fit: ~£600/kWp. Base install (scaffold, enabling works, commissioning): £2,500.
    const pw3Cost = pw3Count * 5000;
    const expCost = expCount * 4000;
    const gatewayCost = hasGateway ? 975 : 0;
    const solarCost = currentData.kwp * 600;
    const baseInstallCost = 2500;
    const g99Cost = 250;

    let systemCost = pw3Cost + expCost + gatewayCost + solarCost + baseInstallCost + g99Cost;

    // Next Million Powerwall Program Rebate
    const currentDate = new Date();
    const programEndDate = new Date('2026-06-30T23:59:59Z');
    let activeRebate = 0;
    if (currentDate <= programEndDate) {
        const eligibleUnits = Math.min(pw3Count + expCount, 2);
        activeRebate = eligibleUnits * 375;
        // systemCost -= activeRebate; // Removed per user request, info note only
    }

    // 25-Year ROI Calculation
    roiData = [];
    let cumulativeCashFlow = -systemCost;
    let currentAnnualSavings = pwSavings;
    const inflationRate = 1.02;

    for (let year = 1; year <= 25; year++) {
        cumulativeCashFlow += currentAnnualSavings;
        roiData.push(cumulativeCashFlow);
        currentAnnualSavings *= inflationRate;
    }

    if (currentChartType === 'financial') {
        renderChart(roiData);
    }

    // Animate Financials
    animateValue(document.getElementById('save-solar'), 0, Math.round(solarSavings), 1000, false);
    animateValue(document.getElementById('save-pw'), 0, Math.round(pwSavings), 1000, false);

    let payback = systemCost / (pwSavings || 1); // simple fallback
    const breakEvenIdx = roiData.findIndex(v => v >= 0);
    if (breakEvenIdx !== -1) payback = breakEvenIdx + 1;
    animateValue(document.getElementById('payback'), 0, payback, 1000, true);

    // Store the system cost for the recordQuote call later
    currentData.lastCalculatedCost = systemCost;
    currentData.lastCalculatedSavings = pwSavings;

    // FIX #7: Use style.display so it co-exists correctly with sm:hidden
    const mobileCostEl = document.getElementById('mobile-cost');
    if (mobileCostEl) {
        animateValue(mobileCostEl, 0, systemCost, 1000, false);
        document.getElementById('mobile-sticky-bar').style.display = '';
    }

    // Update Titles
    const titleEl = document.getElementById('financial-title');
    if (titleEl) {
        titleEl.textContent = `Solar + ${pw3Count}x PW3` + (expCount > 0 ? ` + ${expCount}x Exp` : '');
    }
    const highlightTitle = document.getElementById('highlight-title');
    if (highlightTitle) {
        highlightTitle.textContent = `${pw3Count}x Powerwall 3 Included`;
    }

    // Update Expansion Highlight Card
    const expHighlightCard = document.getElementById('exp-highlight-card');
    const expHighlightCount = document.getElementById('exp-highlight-count');
    if (expHighlightCard) {
        // We keep the card visible to fill space as requested
        const titleEl = expHighlightCard.querySelector('h3');
        if (titleEl) {
            titleEl.textContent = expCount > 0 
                ? `${expCount}x Powerwall DCX Expansion Included` 
                : `Powerwall DCX Expansion Available`;
        }
    }

    // Update Gateway Highlight Card
    const gatewayHighlightCard = document.getElementById('gateway-highlight-card');
    if (gatewayHighlightCard) {
        // We keep the card visible to fill space as requested
        const titleEl = gatewayHighlightCard.querySelector('h3');
        if (titleEl) {
            titleEl.textContent = hasGateway 
                ? `Backup Gateway 2 Included` 
                : `Backup Gateway 2 Available`;
        }
    }

    // Update Rebate Badge
    const rebateBadge = document.getElementById('rebate-badge');
    if (rebateBadge) {
        if (activeRebate > 0) {
            rebateBadge.classList.remove('hidden');
            document.getElementById('rebate-amount').textContent = activeRebate;
        } else {
            rebateBadge.classList.add('hidden');
        }
    }

    // Note: recordQuote is now called via buttons to ensure lead quality
}

gridRateInput.addEventListener('input', calculateFinancials);
const sellRateInput = document.getElementById('sell-rate');
if (sellRateInput) sellRateInput.addEventListener('input', calculateFinancials);

const annualUsageInput = document.getElementById('annual-usage');
const offPeakToggle = document.getElementById('off-peak-toggle');
const offPeakSettings = document.getElementById('off-peak-settings');
const offPeakRateInput = document.getElementById('off-peak-rate');

if (annualUsageInput) annualUsageInput.addEventListener('input', calculateFinancials);
if (offPeakRateInput) offPeakRateInput.addEventListener('input', calculateFinancials);
if (offPeakToggle) {
    offPeakToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            offPeakSettings.classList.remove('hidden');
        } else {
            offPeakSettings.classList.add('hidden');
        }
        calculateFinancials();
    });
}

document.getElementById('add-ev')?.addEventListener('change', calculateFinancials);
document.getElementById('add-hp')?.addEventListener('change', calculateFinancials);

const tariffPreset = document.getElementById('tariff-preset');
if (tariffPreset) {
    tariffPreset.addEventListener('change', (e) => {
        const val = e.target.value;
        const gridRate = document.getElementById('grid-rate');
        const sellRate = document.getElementById('sell-rate');
        const offPeakRate = document.getElementById('off-peak-rate');
        const offPeakTog = document.getElementById('off-peak-toggle');

        if (val === 'standard') {
            gridRate.value = 24.50; sellRate.value = 4.10;
            if (offPeakTog.checked) offPeakTog.click();
        } else if (val === 'octopus_go') {
            gridRate.value = 26.00; sellRate.value = 8.00; offPeakRate.value = 8.50;
            if (!offPeakTog.checked) offPeakTog.click();
        } else if (val === 'octopus_intelligent') {
            gridRate.value = 26.00; sellRate.value = 15.00; offPeakRate.value = 7.00;
            if (!offPeakTog.checked) offPeakTog.click();
        } else if (val === 'ovo_anytime') {
            gridRate.value = 26.00; sellRate.value = 0.00; offPeakRate.value = 7.00;
            if (!offPeakTog.checked) offPeakTog.click();
        }
        calculateFinancials();
    });
}

function updateGenerationMetrics() {
    if (!currentData) return;
    const newWattage = parseInt(document.getElementById('panel-wattage').value) || 400;
    const newPanels = parseInt(document.getElementById('panel-slider').value) || currentData.panels;
    const orientationMultiplier = parseFloat(document.getElementById('roof-orientation').value) || 1.0;

    currentData.panels = newPanels;
    currentData.kwp = (newPanels * newWattage) / 1000;

    const scale = newPanels / currentData.basePanels;
    const wattageScale = newWattage / 400;

    currentData.totalKwh = currentData.baseTotalKwh * scale * wattageScale * orientationMultiplier;
    currentData.production = currentData.baseProduction.map(v => Math.round(v * scale * wattageScale * orientationMultiplier));

    document.getElementById('res-panels').textContent = newPanels;
    document.getElementById('res-kwp').textContent = currentData.kwp.toFixed(1);
    document.getElementById('res-kwh').textContent = Math.round(currentData.totalKwh).toLocaleString();

    calculateFinancials();
    if (currentChartType === 'production') renderChart(currentData.production);
    
    // REDRAW PANELS ON ROOF
    drawPanelsOnRoof(newPanels);
}

document.getElementById('panel-wattage')?.addEventListener('change', updateGenerationMetrics);
document.getElementById('roof-orientation')?.addEventListener('change', updateGenerationMetrics);

const panelSlider = document.getElementById('panel-slider');
if (panelSlider) {
    panelSlider.addEventListener('input', () => {
        if (currentData) {
            const newPanels = parseInt(panelSlider.value);
            document.getElementById('res-panels').textContent = newPanels;
            currentData.panels = newPanels; 
            drawPanelsOnRoof(newPanels); // Instant feedback while sliding
        }
    });
    panelSlider.addEventListener('change', updateGenerationMetrics);
}

document.getElementById('tab-production').addEventListener('click', (e) => {
    currentChartType = 'production';
    e.target.classList.replace('text-gray-400', 'text-white');
    e.target.classList.add('bg-tesla-gray');
    document.getElementById('tab-financial').classList.replace('text-white', 'text-gray-400');
    document.getElementById('tab-financial').classList.remove('bg-tesla-gray');
    if (currentData) renderChart(currentData.production);
});

document.getElementById('tab-financial').addEventListener('click', (e) => {
    currentChartType = 'financial';
    e.target.classList.replace('text-gray-400', 'text-white');
    e.target.classList.add('bg-tesla-gray');
    document.getElementById('tab-production').classList.replace('text-white', 'text-gray-400');
    document.getElementById('tab-production').classList.remove('bg-tesla-gray');
    if (currentData) renderChart(roiData);
});

// Render Chart.js
function renderChart(dataArr) {
    const ctx = document.getElementById('productionChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    Chart.defaults.color = '#9ca3af';
    Chart.defaults.font.family = 'Inter, sans-serif';

    if (currentChartType === 'production') {
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Estimated Generation (kWh)',
                    data: dataArr,
                    backgroundColor: '#E31937', // Tesla Red
                    borderRadius: 4,
                    hoverBackgroundColor: '#ff3344'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1f2937',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 14 },
                        callbacks: {
                            label: function (context) { return context.parsed.y.toLocaleString() + ' kWh'; }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#374151', drawBorder: false },
                        border: { display: false },
                        title: { display: true, text: 'Monthly Generation (kWh)', color: '#9ca3af', font: { size: 12 } }
                    },
                    x: {
                        grid: { display: true, color: 'rgba(255,255,255,0.05)' },
                        border: { display: false }
                    }
                }
            }
        });
    } else {
        // Financial Chart
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({ length: 25 }, (_, i) => `Y${i + 1}`),
                datasets: [{
                    label: 'Cumulative Cash Flow (£)',
                    data: dataArr,
                    borderColor: '#10b981', // green
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#10b981'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1f2937',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 14 },
                        callbacks: {
                            label: function (context) { return '£' + Math.round(context.parsed.y).toLocaleString(); }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: '#374151' },
                        title: { display: true, text: 'Cumulative Cash Flow (£)', color: '#9ca3af', font: { size: 12 } },
                        ticks: {
                            callback: function (value) {
                                if (Math.abs(value) >= 1000) return '£' + (value / 1000).toFixed(0) + 'k';
                                return '£' + value;
                            }
                        }
                    },
                    x: {
                        grid: { display: true, color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }
}

// Copy Summary
document.getElementById('copy-btn').addEventListener('click', async () => {
    if (!currentData) return;
    
    // Record lead when user takes action
    recordQuote(currentData.lastCalculatedCost, currentData.kwp, currentData.lastCalculatedSavings);
    const battText = `${pw3Count}x Powerwall 3` + (expCount > 0 ? ` + ${expCount}x Expansion` : '') + (hasGateway ? ' (with Gateway)' : ' (no Gateway)');
    const totalCap = ((pw3Count + expCount) * 13.5).toFixed(1);

    const kwpVal = typeof currentData.kwp === 'number' ? currentData.kwp.toFixed(1) : parseFloat(currentData.kwp).toFixed(1);
    const custName = document.getElementById('customer-name')?.value.trim();
    const intro = custName ? `Powerwall Pro Estimate for ${custName} (${currentData.address})` : `Powerwall Pro Estimate for ${currentData.address}`;
    const text = `${intro}\n- System Size: ${kwpVal} kWp (${currentData.panels} Panels)\n- Battery: ${battText} (${totalCap} kWh)\n- Est. Annual Production: ${Math.round(currentData.totalKwh).toLocaleString()} kWh\n- Est. Annual Savings: £${document.getElementById('save-pw').textContent}`;

    try {
        await navigator.clipboard.writeText(text);
        const btn = document.getElementById('copy-btn');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = orig, 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
});

// PDF Generation — Premium 3-Page Design
document.getElementById('pdf-btn').addEventListener('click', async () => {
    if (!currentData) return;
    
    // Record lead when user takes action
    recordQuote(currentData.lastCalculatedCost, currentData.kwp, currentData.lastCalculatedSavings);
    const btn = document.getElementById('pdf-btn');
    const orig = btn.textContent;
    btn.textContent = 'Generating...';

    try {
        // ── Populate HTML Template ──────────────────────
        const custName = document.getElementById('customer-name')?.value.trim() || 'Valued Customer';
        const installerName = document.getElementById('installer-name')?.value.trim() || 'Powerwall Pro Partner';
        const installerPhone = document.getElementById('installer-phone')?.value.trim() || '';
        const installerEmail = document.getElementById('installer-email')?.value.trim() || '';
        
        const installerContact = [installerName, installerPhone, installerEmail].filter(Boolean).join(' • ');

        // Page 1
        document.getElementById('pdf-installer-name').textContent = installerName;
        document.getElementById('pdf-date').textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('pdf-quote-ref').textContent = `Ref: PPE-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
        
        document.getElementById('pdf-customer-name').textContent = custName;
        document.getElementById('pdf-customer-address').textContent = currentData.address;

        const kwpVal = typeof currentData.kwp === 'number' ? currentData.kwp.toFixed(1) : parseFloat(currentData.kwp).toFixed(1);
        document.getElementById('pdf-stat-kwp').textContent = kwpVal;
        document.getElementById('pdf-stat-kwh').textContent = Math.round(currentData.totalKwh).toLocaleString();
        
        const savingsEl = document.getElementById('save-pw');
        document.getElementById('pdf-stat-savings').textContent = savingsEl ? savingsEl.textContent : "0";
        
        const paybackEl = document.getElementById('payback');
        document.getElementById('pdf-stat-payback').textContent = paybackEl ? paybackEl.textContent : "0";

        // Handle satellite image via canvas transfer to ensure panels are included in PDF
        const originalSatCanvas = document.getElementById('satellite-canvas');
        const pdfSatImg = document.getElementById('pdf-sat-img');
        if (originalSatCanvas) {
            pdfSatImg.src = originalSatCanvas.toDataURL('image/png');
        }

        document.getElementById('pdf-footer-installer-1').textContent = installerContact;

        // Page 2
        document.getElementById('pdf-spec-panels').textContent = `${currentData.panels}x Panels (${kwpVal} kWp)`;
        
        const pw3Text = pw3Count > 0 ? `${pw3Count}x Powerwall 3` : '';
        const expText = expCount > 0 ? ` + ${expCount}x Expansion` : '';
        const totalCap = ((pw3Count + expCount) * 13.5).toFixed(1);
        document.getElementById('pdf-spec-battery').textContent = `${pw3Text}${expText} (${totalCap} kWh)`;

        const pdfGatewayRow = document.getElementById('pdf-gateway-row');
        if (pdfGatewayRow) {
            if (hasGateway) pdfGatewayRow.classList.remove('hidden');
            else pdfGatewayRow.classList.add('hidden');
        }

        document.getElementById('pdf-footer-installer-2').textContent = installerContact;

        // Render Charts to the PDF canvases
        const prodCanvas = document.getElementById('pdf-chart-production');
        const finCanvas = document.getElementById('pdf-chart-financial');
        
        // Ensure standard colors for PDF rendering
        Chart.defaults.color = '#374151';
        Chart.defaults.font.family = 'Inter, sans-serif';

        const renderPdfChart = (canvas, type, dataArr) => {
            return new Chart(canvas.getContext('2d'), {
                type: type === 'production' ? 'bar' : 'line',
                data: {
                    labels: type === 'production' 
                        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                        : Array.from({ length: 25 }, (_, i) => `Y${i + 1}`),
                    datasets: [{
                        label: type === 'production' ? 'Generation (kWh)' : 'Cash Flow (£)',
                        data: dataArr,
                        backgroundColor: type === 'production' ? '#E31937' : 'rgba(16, 185, 129, 0.1)',
                        borderColor: type === 'production' ? undefined : '#10b981',
                        fill: type !== 'production',
                        tension: 0.4,
                        borderRadius: type === 'production' ? 4 : undefined,
                        pointRadius: type === 'production' ? undefined : 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            grid: { color: '#f3f4f6' }, 
                            border: { display: false },
                            ticks: type === 'financial' ? {
                                callback: function (value) {
                                    if (Math.abs(value) >= 1000) return '£' + (value / 1000).toFixed(0) + 'k';
                                    return '£' + value;
                                }
                            } : undefined
                        },
                        x: { grid: { display: false }, border: { display: false } }
                    }
                }
            });
        };

        const prodChart = renderPdfChart(prodCanvas, 'production', currentData.production);
        const finChart = renderPdfChart(finCanvas, 'financial', roiData);

        // Page 3 - Cost Table
        const pw3Cost = pw3Count * 5000;
        const expCost = expCount * 4000;
        const gatewayCost = hasGateway ? 975 : 0;
        const solarCost = currentData.kwp * 600; 
        const baseInstallCost = 2500;
        const g99Cost = 250;

        const costBody = document.getElementById('pdf-cost-body');
        costBody.innerHTML = '';
        
        const addCostRow = (label, cost) => {
            costBody.innerHTML += `
                <tr>
                    <td class="py-4 px-6 text-sm font-medium text-gray-900">${label}</td>
                    <td class="py-4 px-6 text-sm text-gray-600 text-right">£${Math.round(cost).toLocaleString()}</td>
                </tr>
            `;
        };

        addCostRow(`${pw3Count}x Powerwall 3 Unit(s)`, pw3Cost);
        if (expCount > 0) addCostRow(`${expCount}x Expansion Pack(s)`, expCost);
        if (hasGateway) addCostRow(`Backup Gateway 2`, gatewayCost);
        addCostRow(`${currentData.panels}x Solar Panels (${kwpVal} kWp)`, solarCost);
        addCostRow(`Installation & Labour`, baseInstallCost);
        addCostRow(`G98/G99 Application Fee`, g99Cost);

        const totalCost = pw3Cost + expCost + gatewayCost + solarCost + baseInstallCost + g99Cost;
        document.getElementById('pdf-cost-total').textContent = `£${Math.round(totalCost).toLocaleString()}`;

        // Rebate Logic
        const currentDate = new Date();
        const programEndDate = new Date('2026-06-30T23:59:59Z');
        const rebateBox = document.getElementById('pdf-rebate-box');
        if (currentDate <= programEndDate) {
            const eligibleUnits = Math.min(pw3Count + expCount, 2);
            const activeRebate = eligibleUnits * 375;
            if (activeRebate > 0) {
                rebateBox.classList.remove('hidden');
                document.getElementById('pdf-rebate-text').textContent = `Tesla's Next Million programme may entitle you to a rebate of up to £${activeRebate} directly from Tesla — separate from this quote.`;
            } else {
                rebateBox.classList.add('hidden');
            }
        } else {
            rebateBox.classList.add('hidden');
        }

        document.getElementById('pdf-cta-contact').textContent = `Call ${installerPhone || 'us'} or reply to this email to arrange your site survey.`;
        document.getElementById('pdf-footer-installer-3').textContent = installerContact;

        // Allow DOM to update and charts to render
        await new Promise(resolve => setTimeout(resolve, 500));

        // ── Render with html2canvas and jsPDF ──────────────────────
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // 210 x 297 mm
        
        const pages = ['pdf-page-1', 'pdf-page-2', 'pdf-page-3'];
        
        for (let i = 0; i < pages.length; i++) {
            const element = document.getElementById(pages[i]);
            const canvas = await html2canvas(element, {
                scale: 2, // High resolution
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            
            if (i > 0) doc.addPage();
            
            doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }

        // Cleanup charts & restore UI chart color defaults
        prodChart.destroy();
        finChart.destroy();
        Chart.defaults.color = '#9ca3af';

        // Save
        const safeName = custName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        doc.save(`powerwall_estimate_${safeName}.pdf`);

    } catch (err) {
        console.error("PDF generation failed", err);
        alert("Failed to generate PDF. Check console for details.");
    } finally {
        btn.textContent = orig;
    }
});

// --- Solar Panel Overlay Logic ---
function drawPanelsOnRoof(count) {
    const canvas = document.getElementById('satellite-canvas');
    const img = document.getElementById('satellite-img');
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    const w = 600;
    const h = 300;
    
    canvas.width = w;
    canvas.height = h;
    
    // 1. Draw Satellite Image
    ctx.drawImage(img, 0, 0, w, h);
    
    // If we don't have real panel data (mocking), don't draw overlays
    if (!currentData || !currentData.panelsList) return;

    // 2. Setup Projection Constants
    const zoom = 20;
    const centerLat = currentData.lat;
    const centerLng = currentData.lng;
    
    const project = (lat, lng) => {
        let siny = Math.sin((lat * Math.PI) / 180);
        siny = Math.min(Math.max(siny, -0.9999), 0.9999);
        return {
            x: 256 * (0.5 + lng / 360),
            y: 256 * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
        };
    };
    
    const scale = Math.pow(2, zoom);
    const centerPoint = project(centerLat, centerLng);
    
    // 3. Draw Panels
    // --- Premium Aesthetics ---
    // Deep Solar Blue Gradient
    const panelGradient = ctx.createLinearGradient(-5, -5, 5, 5);
    panelGradient.addColorStop(0, '#1a365d'); // Deep Blue
    panelGradient.addColorStop(0.5, '#2c5282'); // Lighter Blue
    panelGradient.addColorStop(1, '#1a365d');
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.5;
    
    const panelsToDraw = currentData.panelsList.slice(0, count);
    
    panelsToDraw.forEach(panel => {
        const point = project(panel.center.latitude, panel.center.longitude);
        const px = w / 2 + (point.x - centerPoint.x) * scale;
        const py = h / 2 + (point.y - centerPoint.y) * scale;
        
        const segment = currentData.segments[panel.segmentId];
        const azimuth = segment ? segment.azimuth : 0;
        
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate((azimuth * Math.PI) / 180);
        
        const pWidth = 11.5; // Slightly larger for visual impact
        const pHeight = 7.5;
        
        // --- 1. Outer Glow/Shadow for depth ---
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        
        // --- 2. Main Panel Body ---
        ctx.fillStyle = panelGradient;
        
        if (panel.orientation === 'LANDSCAPE') {
            ctx.fillRect(-pWidth/2, -pHeight/2, pWidth, pHeight);
            ctx.strokeRect(-pWidth/2, -pHeight/2, pWidth, pHeight);
            
            // --- 3. Glossy Reflection Overlay ---
            const gloss = ctx.createLinearGradient(-pWidth/2, -pHeight/2, pWidth/2, pHeight/2);
            gloss.addColorStop(0, 'rgba(255,255,255,0.15)');
            gloss.addColorStop(0.4, 'rgba(255,255,255,0)');
            gloss.addColorStop(1, 'rgba(255,255,255,0.05)');
            ctx.fillStyle = gloss;
            ctx.fillRect(-pWidth/2, -pHeight/2, pWidth, pHeight);
            
        } else {
            ctx.fillRect(-pHeight/2, -pWidth/2, pHeight, pWidth);
            ctx.strokeRect(-pHeight/2, -pWidth/2, pHeight, pWidth);
            
            // Glossy Reflection for Portrait
            const gloss = ctx.createLinearGradient(-pHeight/2, -pWidth/2, pHeight/2, pWidth/2);
            gloss.addColorStop(0, 'rgba(255,255,255,0.15)');
            gloss.addColorStop(0.4, 'rgba(255,255,255,0)');
            gloss.addColorStop(1, 'rgba(255,255,255,0.05)');
            ctx.fillStyle = gloss;
            ctx.fillRect(-pHeight/2, -pWidth/2, pHeight, pWidth);
        }
        
        ctx.restore();
    });
}

// Initialize App
window.onload = loadGoogleMapsAPI;
