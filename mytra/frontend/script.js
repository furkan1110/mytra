const BASE_URL = 'http://127.0.0.1:5000'; // Backend Flask uygulamasının çalıştığı adres

let currentChart = null; // Charts sekmesindeki büyük grafik için Chart.js örneği
let activePriceInterval = null; // Anasayfa canlı fiyat güncelleme interval'i
let currentTradePriceInterval = null; // İşlem açma ekranı için canlı fiyat interval'i
let activeTradesUpdateInterval = null; // Açık işlemler için güncelleme interval'i

let symbolPrices = {}; // Tüm sembollerin anlık bid ve ask fiyatlarını tutacak obje
let currentMiniChartInstance = null; // Anasayfa mini grafik Chart.js örneğini tutmak için

// Sabitler: Anasayfa için varsayılan popüler semboller
const DEFAULT_LIVE_PRICES_SYMBOLS = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/TRY", "XAU/USD", "WTI/USD",
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"
];


// ***************************************************************
// GLOBAL YARDIMCI FONKSİYONLAR
// ***************************************************************

function showMessageModal(message) {
    document.getElementById('modal-message').innerText = message;
    document.getElementById('modal-message').style.color = message.includes("hata") || message.includes("başarısız") || message.includes("yetersiz") ? 'red' : 'green'; 
    document.getElementById('message-modal').style.display = 'flex';
}

async function fetchPricesForAllSymbols(symbolsToFetch) {
    for (const symbol of symbolsToFetch) {
        try {
            const encodedSymbol = encodeURIComponent(symbol);
            const response = await fetch(`${BASE_URL}/get_price/${encodedSymbol}`);
            const data = await response.json();
            if (response.ok && data.bid_price !== undefined && data.ask_price !== undefined) { 
                symbolPrices[symbol] = { bid: data.bid_price, ask: data.ask_price };
            } else {
                console.error(`Sembol ${symbol} için fiyat çekilemedi: ${data.message || response.status}`);
                symbolPrices[symbol] = { bid: null, ask: null };
            }
        } catch (error) {
            console.error(`Sembol ${symbol} için anlık fiyat çekilirken hata:`, error);
            symbolPrices[symbol] = { bid: null, ask: null };
        }
    }
}

async function updateCurrentPriceDisplay() {
    const symbolSelect = document.getElementById('trade-symbol');
    const symbol = symbolSelect.value;
    const priceDisplayElement = document.getElementById('current-trade-price');
    const tradeTypeSelect = document.getElementById('trade-type');
    const tradeType = tradeTypeSelect.value; 

    if (!symbol) {
        priceDisplayElement.textContent = 'Sembol seçiniz.';
        return;
    }

    // Fiyatı merkezi bellekten al
    const prices = symbolPrices[symbol];

    if (prices && (prices.bid !== null || prices.ask !== null)) {
        const priceToDisplay = (tradeType === 'BUY') ? prices.ask : prices.bid; 

        if (priceToDisplay !== null) {
            const isCrypto = ["BTCUSDT", "ETHUSDT", "SHIBUSDT", "PEPEUSDT", "SOLUSDT", "BNBUSDT", "LUNCUSDT", "DOGEUSDT", "XRPUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT"].includes(symbol);
            const isJPY = ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY"].includes(symbol);
            const isTRY = ["USD/TRY"].includes(symbol);
            const isCommodity = ["XAU/USD", "WTI/USD", "XAG/USD", "NATGAS/USD"].includes(symbol);

            let precision = 4; // Varsayılan forex hassasiyeti
            if (isCrypto) precision = 8;
            else if (isJPY) precision = 3; 
            else if (isTRY || isCommodity) precision = 2; 

            priceDisplayElement.textContent = `${priceToDisplay.toFixed(precision)} USD`;
        } else {
            priceDisplayElement.textContent = 'Fiyat çekilemedi.';
        }
    } else {
        priceDisplayElement.textContent = 'Fiyat bekleniyor...';
    }
    tradeTypeSelect.onchange = updateCurrentPriceDisplay; // İşlem tipi değiştiğinde de fiyatı güncelle
}

function varToRgb(varName) {
    const style = getComputedStyle(document.body);
    const color = style.getPropertyValue(varName).trim();
    if (color.startsWith('#')) {
        let c = color.substring(1);
        if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        return `rgb(${r}, ${g}, ${b})`;
    }
    return color;
}

function goToChartsAndSetTrade(symbol, type) {
    showSection('charts');
    document.getElementById('trade-symbol').value = symbol;
    document.getElementById('trade-type').value = type;
    loadChartData(); 
}

// Yeni: Telefon numarası placeholder ve maxLength güncelleme fonksiyonu
function updatePhonePlaceholder() {
    const countrySelect = document.getElementById('register-country-code');
    const phoneInput = document.getElementById('register-phone');
    const selectedOption = countrySelect.options[countrySelect.selectedIndex];
    
    let placeholderText = "Numara (örn: ";
    let maxLength = 15; 

    const countryCode = selectedOption.value;
    if (countryCode === "TR") {
        placeholderText += "5551234567)";
        maxLength = 10;
    } else if (countryCode === "US") {
        placeholderText += "1234567890)";
        maxLength = 10;
    } else if (countryCode === "GB") {
        placeholderText += "7123456789)"; 
        maxLength = 10;
    } else if (countryCode === "DE") {
        placeholderText += "17012345678)";
        maxLength = 11; 
    } else { // DEFAULT veya diğer
        placeholderText = "Telefon Numarası (ülke kodu olmadan)";
        maxLength = 15;
    }
    phoneInput.placeholder = placeholderText;
    phoneInput.maxLength = maxLength;
}

// Yeni: Fiyat görünümünü değiştirme fonksiyonu (Tablo/Liste)
function togglePriceView(viewType) {
    const gridView = document.getElementById('live-prices-grid');
    const listView = document.getElementById('live-prices-list');
    const gridButton = document.querySelector('.view-toggle button:nth-child(1)');
    const listButton = document.querySelector('.view-toggle button:nth-child(2)');

    if (viewType === 'grid') {
        gridView.style.display = 'grid';
        listView.style.display = 'none';
        gridButton.classList.add('active');
        listButton.classList.remove('active');
        localStorage.setItem('preferredPriceView', 'grid');
    } else { // viewType === 'list'
        gridView.style.display = 'none';
        listView.style.display = 'block';
        gridButton.classList.remove('active');
        listButton.classList.add('active');
        localStorage.setItem('preferredPriceView', 'list');
    }
}

// Yeni: Anasayfa mini grafiği gösterme/güncelleme
async function displayMiniChart(symbol, containerElement) { // Artık ID yerine doğrudan element alıyor
    if (!containerElement) return;

    // Önceki mini grafiği yok et
    if (currentMiniChartInstance) {
        currentMiniChartInstance.destroy();
        currentMiniChartInstance = null;
    }
    // Diğer tüm mini grafik container'larını gizle
    document.querySelectorAll('.mini-chart-container').forEach(c => {
        if (c !== containerElement) { // Tıklanan hariç
            c.style.display = 'none';
        }
    });

    containerElement.style.display = 'block'; // Tıklanan container'ı görünür yap

    try {
        const encodedSymbol = encodeURIComponent(symbol);
        const response = await fetch(`${BASE_URL}/get_historical_data/${encodedSymbol}/1min`); 
        const data = await response.json();

        if (data.status === 'ok' && data.values && data.values.length > 0) {
            const labels = data.values.map(v => new Date(v.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); 
            const closePrices = data.values.map(v => v.close);

            // Canvas elementini kontrol et veya oluştur
            let ctx = containerElement.querySelector('canvas');
            if (!ctx) {
                ctx = document.createElement('canvas');
                containerElement.innerHTML = ''; // Önceki mesajı temizle
                containerElement.appendChild(ctx);
            }

            currentMiniChartInstance = new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `${symbol}`,
                        data: closePrices,
                        borderColor: varToRgb('--primary-color'),
                        borderWidth: 1,
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    scales: {
                        x: { display: false },
                        y: { display: false }  
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false } 
                    }
                }
            });
        } else {
            containerElement.innerHTML = `<canvas></canvas><p style="text-align:center; font-size:0.9em;">${symbol} için veri bulunamadı.</p>`;
        }
    } catch (error) {
        console.error(`Mini grafik (${symbol}) yüklenirken hata:`, error);
        containerElement.innerHTML = `<canvas></canvas><p style="text-align:center; font-size:0.9em; color:red;">Grafik Hatası!</p>`;
    }
}


// ***************************************************************
// ANA UYGULAMA MANTIĞI VE SAYFA GEÇİŞLERİ
// ***************************************************************

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    loadAvailableSymbols(); 
    showSection('home');
    loadLivePrices(); 

    document.querySelectorAll('.faq-item h3').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('active');
        });
    });

    const modal = document.getElementById('message-modal');
    const closeButton = document.querySelector('.close-button');
    closeButton.onclick = function() {
        modal.style.display = 'none';
    }
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    const registerCountryCodeSelect = document.getElementById('register-country-code');
    if (registerCountryCodeSelect) {
        registerCountryCodeSelect.addEventListener('change', updatePhonePlaceholder);
        updatePhonePlaceholder(); 
    }
    // Tercih edilen görünümü yükle, yoksa varsayılan olarak tablo
    togglePriceView(localStorage.getItem('preferredPriceView') || 'grid'); 
});


function showSection(sectionId) {
    document.querySelectorAll('section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');

    // Tüm eski interval'leri temizle
    if (activePriceInterval) {
        clearInterval(activePriceInterval);
        activePriceInterval = null;
    }
    if (currentTradePriceInterval) {
        clearInterval(currentTradePriceInterval);
        currentTradePriceInterval = null;
    }
    if (activeTradesUpdateInterval) {
        clearInterval(activeTradesUpdateInterval);
        activeTradesUpdateInterval = null;
    }
    if (currentMiniChartInstance) { // Mini grafik örneğini yok et
        currentMiniChartInstance.destroy();
        currentMiniChartInstance = null;
        // Tüm mini grafik container'larını gizle (her sekme değişiminde)
        document.querySelectorAll('.mini-chart-container').forEach(c => c.style.display = 'none');
    }


    // Yeni section'a göre işlemleri başlat
    if (sectionId === 'charts') {
        const symbolsToMonitor = Array.from(document.getElementById('trade-symbol').options).map(option => option.value);
        const updateAllChartRelatedPrices = async () => {
            await fetchPricesForAllSymbols(symbolsToMonitor);
            updateCurrentPriceDisplay();
            fetchActiveTrades();
        };
        updateAllChartRelatedPrices(); 
        currentTradePriceInterval = setInterval(updateAllChartRelatedPrices, 2000); 
        loadChartData(); 
    } else if (sectionId === 'wallet') {
        fetchUserInfo();
    } else if (sectionId === 'trade-history') {
        fetchTradeHistory();
    } else if (sectionId === 'signals') {
        fetchSignals();
    } else if (sectionId === 'home') {
        loadLivePrices();
        togglePriceView(localStorage.getItem('preferredPriceView') || 'grid'); 
    }
}

async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const authMenu = document.getElementById('auth-menu');
    const loginButtonsNav = document.getElementById('login-buttons-nav'); 
    const userDisplayName = document.getElementById('user-display-name');
    const adminPanelLink = document.getElementById('admin-panel-link');
    const homeRegisterBtn = document.getElementById('home-register-btn');
    const homeForexInfoBtn = document.getElementById('home-forex-info-btn');

    if (token && username) {
        authMenu.style.display = 'block';
        loginButtonsNav.style.display = 'none'; 
        userDisplayName.textContent = `Hoş Geldin, ${username}`;

        const userRole = localStorage.getItem('user_role'); 
        if (userRole === 'admin') {
            adminPanelLink.style.display = 'block';
        } else {
            adminPanelLink.style.display = 'none';
        }
        
        if (homeRegisterBtn) homeRegisterBtn.style.display = 'none';
        if (homeForexInfoBtn) homeForexInfoBtn.style.display = 'none';

        showSection('home'); 
        loadAvailableSymbols(); 
    } else {
        authMenu.style.display = 'none';
        loginButtonsNav.style.display = 'flex'; 
        adminPanelLink.style.display = 'none';

        if (homeRegisterBtn) homeRegisterBtn.style.display = 'inline-block'; 
        if (homeForexInfoBtn) homeForexInfoBtn.style.display = 'inline-block';
        
        showSection('home');
    }
}

// ***************************************************************
// KİMLİK DOĞRULAMA VE KULLANICI YÖNETİMİ
// ***************************************************************

async function registerUser() {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value;
    const countryCode = document.getElementById('register-country-code').value;
    const phone = document.getElementById('register-phone').value; 

    if (!username || !password || !email || !countryCode || !phone) {
        showMessageModal('Lütfen tüm alanları doldurun!');
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email, country_code: countryCode, phone: phone }) 
        });
        const data = await response.json();
        showMessageModal(data.message);
        if (response.ok) {
            document.getElementById('register-username').value = '';
            document.getElementById('register-password').value = '';
            document.getElementById('register-email').value = '';
            document.getElementById('register-country-code').value = 'TR'; 
            document.getElementById('register-phone').value = '';
            updatePhonePlaceholder(); 
            showSection('login-section'); 
        }
    } catch (error) {
        console.error('Kayıt hatası:', error);
        showMessageModal(error.message || 'Bir hata oluştu, lütfen tekrar deneyin.');
    }
}

async function loginUser() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            localStorage.setItem('user_role', data.role); 
            showMessageModal('Giriş başarılı!');
            checkAuthStatus(); 
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
        } else {
            showMessageModal(data.message || 'Giriş başarısız.');
        }
    } catch (error) {
        console.error('Giriş hatası:', error);
        showMessageModal('Bir hata oluştu, lütfen tekrar deneyin.');
    }
}

async function demoLogin() {
    try {
        const response = await fetch(`${BASE_URL}/demo_login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            localStorage.setItem('user_role', data.role); 
            showMessageModal('Demo giriş başarılı! 5000 USD bakiye ile başlayın.');
            checkAuthStatus(); 
        } else {
            showMessageModal(data.message || 'Demo giriş başarısız.');
        }
    } catch (error) {
        console.error('Demo giriş hatası:', error);
        showMessageModal('Bir hata oluştu, lütfen tekrar deneyin.');
    }
}


function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('user_role'); 
    localStorage.removeItem('preferredPriceView'); 
    showMessageModal('Çıkış yapıldı.');
    checkAuthStatus(); 
    
    if (activePriceInterval) {
        clearInterval(activePriceInterval);
        activePriceInterval = null;
    }
    if (currentTradePriceInterval) {
        clearInterval(currentTradePriceInterval);
        currentTradePriceInterval = null;
    }
    if (activeTradesUpdateInterval) {
        clearInterval(activeTradesUpdateInterval);
        activeTradesUpdateInterval = null;
    }
    if (currentMiniChartInstance) { 
        currentMiniChartInstance.destroy();
        currentMiniChartInstance = null;
        document.querySelectorAll('.mini-chart-container').forEach(c => c.style.display = 'none');
    }
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        showMessageModal('Bu işlemi yapmak için giriş yapmalısınız.');
        showSection('login-section'); 
        throw new Error('No token found');
    }
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        showMessageModal('Oturumunuzun süresi doldu veya yetkiniz yok. Lütfen tekrar giriş yapın.');
        logout(); 
        throw new Error('Unauthorized');
    }
    return response;
}

// ***************************************************************
// SEMBOL, FİYAT VE GRAFİK YÖNETİMİ
// ***************************************************************

async function loadAvailableSymbols() {
    try {
        const response = await fetch(`${BASE_URL}/get_available_symbols`);
        const data = await response.json();
        const chartSymbolSelect = document.getElementById('chart-symbol-select');
        const tradeSymbolSelect = document.getElementById('trade-symbol');

        chartSymbolSelect.innerHTML = '';
        tradeSymbolSelect.innerHTML = '';

        data.symbols.forEach(s => {
            const optionChart = document.createElement('option');
            optionChart.value = s.symbol;
            optionChart.textContent = `${s.symbol} (${s.type.toUpperCase()})`;
            chartSymbolSelect.appendChild(optionChart);

            const optionTrade = document.createElement('option');
            optionTrade.value = s.symbol;
            optionTrade.textContent = `${s.symbol} (${s.type.toUpperCase()})`;
            tradeSymbolSelect.appendChild(optionTrade);
        });
        const allSymbols = data.symbols.map(s => s.symbol);
        await fetchPricesForAllSymbols(allSymbols); 

        if (document.getElementById('charts').classList.contains('active')) {
            updateCurrentPriceDisplay();
        }
    } catch (error) {
        console.error('Mevcut semboller yüklenirken hata:', error);
    }
}

async function loadLivePrices() {
    const livePricesGridDiv = document.getElementById('live-prices-grid');
    const livePricesListDiv = document.getElementById('live-prices-list');

    // Bu liste, uygulamanın gösterdiği tüm sembolleri içerir.
    // Kullanıcının favori listesi localStorage'dan çekilebilir.
    let symbolsToDisplay = localStorage.getItem('favoriteSymbols');
    if (symbolsToDisplay) {
        symbolsToDisplay = JSON.parse(symbolsToDisplay);
    } else {
        symbolsToDisplay = DEFAULT_LIVE_PRICES_SYMBOLS; // Varsayılan popüler semboller
        localStorage.setItem('favoriteSymbols', JSON.stringify(symbolsToDisplay)); // Varsayılanı kaydet
    }


    if (activePriceInterval) {
        clearInterval(activePriceInterval);
        activePriceInterval = null;
    }

    const updateAllLivePrices = async () => {
        await fetchPricesForAllSymbols(symbolsToDisplay); 

        livePricesGridDiv.innerHTML = ''; 
        livePricesListDiv.innerHTML = `
            <div class="live-prices-list-header">
                <span>Sembol</span>
                <span>Alış</span>
                <span>Satış</span>
                <span>İşlem</span>
            </div>
        `;

        for (const symbol of symbolsToDisplay) {
            const prices = symbolPrices[symbol]; 
            const bidPrice = prices ? prices.bid : undefined;
            const askPrice = prices ? prices.ask : undefined;

            const isCrypto = ["BTCUSDT", "ETHUSDT", "SHIBUSDT", "PEPEUSDT", "SOLUSDT", "BNBUSDT", "LUNCUSDT", "DOGEUSDT", "XRPUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT"].includes(symbol);
            const isJPY = ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY"].includes(symbol);
            const isTRY = ["USD/TRY"].includes(symbol);
            const isCommodity = ["XAU/USD", "WTI/USD", "XAG/USD", "NATGAS/USD"].includes(symbol);

            let precision = 4; // Varsayılan forex
            if (isCrypto) precision = 8;
            else if (isJPY) precision = 3;
            else if (isTRY || isCommodity) precision = 2;

            const displaySymbol = symbol.replace('USDT', '/USDT').replace('XAU', 'Gold').replace('XAG', 'Silver').replace('WTI', 'Oil').replace('NATGAS', 'Natural Gas'); 

            if (bidPrice !== undefined && askPrice !== undefined) {
                // Grid Görünümü
                const priceCard = document.createElement('div');
                priceCard.classList.add('price-card');
                priceCard.onclick = () => { // Tıklandığında mini grafik açma
                    const miniChartDiv = priceCard.querySelector('.mini-chart-container') || document.createElement('div');
                    if (!priceCard.querySelector('.mini-chart-container')) {
                        miniChartDiv.classList.add('mini-chart-container');
                        priceCard.appendChild(miniChartDiv);
                    }
                    displayMiniChart(symbol, miniChartDiv); // doğrudan element gönder
                };
                priceCard.innerHTML = `
                    <h4>${displaySymbol}</h4>
                    <p>Alış: ${bidPrice.toFixed(precision)}</p>
                    <p>Satış: ${askPrice.toFixed(precision)}</p>
                    <div class="trade-buttons">
                        <button class="buy-btn" onclick="goToChartsAndSetTrade('${symbol}', 'BUY')">Al</button>
                        <button class="sell-btn" onclick="goToChartsAndSetTrade('${symbol}', 'SELL')">Sat</button>
                    </div>
                `;
                livePricesGridDiv.appendChild(priceCard);

                // Liste Görünümü
                const listItem = document.createElement('div');
                listItem.classList.add('live-prices-list-item');
                listItem.onclick = () => { // Tıklandığında mini grafik açma
                    // Diğer tüm mini grafik container'larını gizle
                    document.querySelectorAll('.mini-chart-container').forEach(c => c.style.display = 'none');
                    // Bu öğe için yeni bir mini grafik div'i oluştur (eğer yoksa)
                    let miniChartDiv = listItem.nextElementSibling; // Sonraki kardeş eleman
                    if (!miniChartDiv || !miniChartDiv.classList.contains('mini-chart-container')) {
                        miniChartDiv = document.createElement('div');
                        miniChartDiv.classList.add('mini-chart-container');
                        listItem.parentNode.insertBefore(miniChartDiv, listItem.nextSibling); // Hemen altına ekle
                    }
                    displayMiniChart(symbol, miniChartDiv); // doğrudan element gönder
                };
                listItem.innerHTML = `
                    <span>${displaySymbol}</span>
                    <span>${bidPrice.toFixed(precision)}</span>
                    <span>${askPrice.toFixed(precision)}</span>
                    <span class="trade-buttons">
                        <button class="buy-btn" onclick="goToChartsAndSetTrade('${symbol}', 'BUY')">Al</button>
                        <button class="sell-btn" onclick="goToChartsAndSetTrade('${symbol}', 'SELL')">Sat</button>
                    </span>
                `;
                livePricesListDiv.appendChild(listItem);

            } else {
                // Fiyat yüklenemediğinde placeholder (Grid)
                const priceCard = document.createElement('div');
                priceCard.classList.add('price-card');
                priceCard.innerHTML = `<h4>${displaySymbol}</h4><p>Yükleniyor...</p><div class="trade-buttons"><button class="buy-btn" onclick="goToChartsAndSetTrade('${symbol}', 'BUY')">Al</button><button class="sell-btn" onclick="goToChartsAndSetTrade('${symbol}', 'SELL')">Sat</button></div>`;
                livePricesGridDiv.appendChild(priceCard);

                // Fiyat yüklenemediğinde placeholder (Liste)
                const listItem = document.createElement('div');
                listItem.classList.add('live-prices-list-item');
                listItem.innerHTML = `<span>${displaySymbol}</span><span>Yükleniyor...</span><span>Yükleniyor...</span><span class="trade-buttons"><button class="buy-btn" onclick="goToChartsAndSetTrade('${symbol}', 'BUY')">Al</button><button class="sell-btn" onclick="goToChartsAndSetTrade('${symbol}', 'SELL')">Sat</button></span>`;
                livePricesListDiv.appendChild(listItem);
            }
        }
    };

    await updateAllLivePrices(); 
    activePriceInterval = setInterval(updateAllLivePrices, 5000); 
}


async function loadChartData() {
    const symbol = document.getElementById('chart-symbol-select').value;
    const interval = document.getElementById('chart-interval-select').value;

    if (!symbol || !interval) return;

    try {
        const encodedSymbol = encodeURIComponent(symbol);
        const response = await fetch(`${BASE_URL}/get_historical_data/${encodedSymbol}/${interval}`);
        const data = await response.json();

        if (data.status === 'ok' && data.values && data.values.length > 0) {
            const labels = data.values.map(v => new Date(v.datetime).toLocaleString()); 
            const closePrices = data.values.map(v => v.close);

            const ctx = document.getElementById('forexChart').getContext('2d');

            if (currentChart) {
                currentChart.destroy();
            }

            currentChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `${symbol} Kapanış Fiyatları`,
                        data: closePrices,
                        borderColor: varToRgb('--primary-color'),
                        borderWidth: 2,
                        fill: false,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Zaman',
                                color: varToRgb('--text-color')
                            },
                            ticks: {
                                autoSkip: false,
                                maxRotation: 45,
                                minRotation: 45
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Fiyat',
                                color: varToRgb('--text-color')
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                        }
                    }
                }
            });
        } else {
            showMessageModal('Grafik verisi bulunamadı.');
        }
    } catch (error) {
        console.error('Grafik verisi yüklenirken hata:', error);
        showMessageModal('Grafik verisi yüklenirken bir hata oluştu.');
    }
}


// ***************************************************************
// İŞLEM YÖNETİMİ
// ***************************************************************

async function openTrade() {
    const symbol = document.getElementById('trade-symbol').value;
    const type = document.getElementById('trade-type').value; // 'BUY' veya 'SELL'
    const amount = document.getElementById('trade-amount').value;
    const tp = document.getElementById('trade-tp').value;
    const sl = document.getElementById('trade-sl').value;

    if (!symbol || !type || !amount) {
        showMessageModal('Lütfen sembol, tip ve miktar girin.');
        return;
    }

    const prices = symbolPrices[symbol];
    if (prices === undefined || prices.bid === null || prices.ask === null) {
        showMessageModal('Anlık fiyat henüz mevcut değil, lütfen bekleyin veya farklı bir sembol seçin.');
        return;
    }

    const priceForTrade = (type === 'BUY') ? prices.ask : prices.bid; 

    try {
        const response = await fetchWithAuth(`${BASE_URL}/open_trade`, {
            method: 'POST',
            body: JSON.stringify({
                symbol,
                type,
                amount: parseFloat(amount),
                price_for_trade: priceForTrade, 
                tp: tp ? parseFloat(tp) : null,
                sl: sl ? parseFloat(sl) : null
            })
        });
        const data = await response.json();
        if (response.ok) {
            showMessageModal(data.message);
            fetchUserInfo(); 
            if (document.getElementById('charts').classList.contains('active')) {
                fetchActiveTrades(); 
            }
            document.getElementById('trade-amount').value = '1'; 
            document.getElementById('trade-tp').value = '';
            document.getElementById('trade-sl').value = '';
        } else {
            showMessageModal(data.message || 'İşlem açılırken hata oluştu.');
        }
    } catch (error) {
        console.error('İşlem açma hatası:', error);
        showMessageModal(error.message || 'İşlem açılırken bir sorun oluştu.'); 
    }
}

async function closeTrade(tradeId, symbol, entryPrice, tradeType, amount) {
    const prices = symbolPrices[symbol];
    if (prices === undefined || prices.bid === null || prices.ask === null) {
        showMessageModal('Anlık fiyat henüz mevcut değil, lütfen tekrar deneyin.');
        return;
    }
    const closingPrice = (tradeType === 'BUY') ? prices.bid : prices.ask; 

    try {
        const response = await fetchWithAuth(`${BASE_URL}/close_trade`, {
            method: 'POST',
            body: JSON.stringify({
                trade_id: tradeId,
                closing_price: closingPrice, 
                entry_price: entryPrice,
                trade_type: tradeType,
                amount: amount
            })
        });
        const data = await response.json();
        if (response.ok) {
            showMessageModal(`İşlem kapatıldı. Kar/Zarar: ${data.profit_loss.toFixed(2)} USD`);
            fetchUserInfo(); 
            fetchTradeHistory();
            if (document.getElementById('charts').classList.contains('active')) {
                fetchActiveTrades(); 
            }
        } else {
            showMessageModal(data.message || 'İşlem kapatılırken hata oluştu.');
        }
    } catch (error) {
        console.error('İşlem kapatma hatası:', error);
        showMessageModal('İşlem kapatılırken bir sorun oluştu.');
    }
}

async function updateTradeTPSL(tradeId, currentSymbol, currentEntryPrice, currentTradeType, currentAmount) {
    const tpInput = document.getElementById(`tp-input-${tradeId}`);
    const slInput = document.getElementById(`sl-input-${tradeId}`);
    const newTp = tpInput.value ? parseFloat(tpInput.value) : null;
    const newSl = slInput.value ? parseFloat(slInput.value) : null;

    // Basit bir doğrulama: TP SL giriş fiyatına göre mantıklı mı?
    if (newTp && currentTradeType === 'BUY' && newTp < currentEntryPrice) {
        showMessageModal('Alış işlemi için Kar Al (TP) fiyatı giriş fiyatından yüksek olmalıdır.');
        return;
    }
    if (newTp && currentTradeType === 'SELL' && newTp > currentEntryPrice) {
        showMessageModal('Satış işlemi için Kar Al (TP) fiyatı giriş fiyatından düşük olmalıdır.');
        return;
    }
    if (newSl && currentTradeType === 'BUY' && newSl > currentEntryPrice) {
        showMessageModal('Alış işlemi için Zarar Durdur (SL) fiyatı giriş fiyatından düşük olmalıdır.');
        return;
    }
    if (newSl && currentTradeType === 'SELL' && newSl < currentEntryPrice) {
        showMessageModal('Satış işlemi için Zarar Durdur (SL) fiyatı giriş fiyatından yüksek olmalıdır.');
        return;
    }


    try {
        const response = await fetchWithAuth(`${BASE_URL}/update_trade_tpsl`, {
            method: 'POST',
            body: JSON.stringify({
                trade_id: tradeId,
                tp: newTp,
                sl: newSl
            })
        });
        const data = await response.json();
        if (response.ok) {
            showMessageModal(data.message);
            fetchActiveTrades(); 
        } else {
            showMessageModal(data.message || 'TP/SL güncellenirken hata oluştu.');
        }
    } catch (error) {
        console.error('TP/SL güncelleme hatası:', error);
        showMessageModal('TP/SL güncellenirken bir sorun oluştu.');
    }
}


async function fetchActiveTrades() {
    const activeTradesList = document.getElementById('active-trades-list');
    const currentTitleHtml = activeTradesList.querySelector('h3') ? activeTradesList.querySelector('h3').outerHTML : '';
    activeTradesList.innerHTML = currentTitleHtml; 

    try {
        const response = await fetchWithAuth(`${BASE_URL}/active_trades`);
        const data = await response.json();
        
        if (data.active_trades && data.active_trades.length > 0) {
            for (const trade of data.active_trades) {
                const prices = symbolPrices[trade.symbol]; 
                const current_price = prices ? ((trade.type === 'BUY') ? prices.bid : prices.ask) : undefined; 

                let displayPrice = 'Yükleniyor...';
                let current_profit_loss = 0.0;
                let profitLossClass = '';

                if (current_price !== undefined) { 
                    const isCrypto = ["BTCUSDT", "ETHUSDT", "SHIBUSDT", "PEPEUSDT", "SOLUSDT", "BNBUSDT", "LUNCUSDT", "DOGEUSDT", "XRPUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT"].includes(trade.symbol);
                    const isJPY = ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY"].includes(trade.symbol);
                    const isTRY = ["USD/TRY"].includes(trade.symbol);
                    const isCommodity = ["XAU/USD", "WTI/USD", "XAG/USD", "NATGAS/USD"].includes(trade.symbol);

                    let pricePrecision = 4;
                    if (isCrypto) pricePrecision = 8;
                    else if (isJPY) pricePrecision = 3;
                    else if (isTRY || isCommodity) pricePrecision = 2;

                    displayPrice = current_price.toFixed(pricePrecision);

                    if (trade.type === 'BUY') {
                        current_profit_loss = (current_price - trade.entry_price) * trade.amount;
                    } else if (trade.type === 'SELL') {
                        current_profit_loss = (trade.entry_price - current_price) * trade.amount;
                    }
                    profitLossClass = current_profit_loss >= 0 ? 'profit' : 'loss';
                }

                const tradeItem = document.createElement('div');
                tradeItem.classList.add('trade-item');
                tradeItem.innerHTML = `
                    <span>ID: ${trade.id.substring(0, 8)}...</span>
                    <span>Sembol: ${trade.symbol}</span>
                    <span>Tip: ${trade.type}</span>
                    <span>Miktar: ${trade.amount}</span>
                    <span>Giriş F: ${trade.entry_price.toFixed(4)}</span>
                    <span>Anlık F: ${displayPrice}</span>
                    <span class="${profitLossClass}">Anlık K/Z: ${current_profit_loss.toFixed(2)} USD</span>
                    <span>Açılış Zamanı: ${new Date(trade.opening_time).toLocaleString()}</span>
                    <div class="tpsl-controls">
                        <span>TP: <input type="number" id="tp-input-${trade.id}" value="${trade.tp !== null ? trade.tp : ''}" placeholder="Fiyat"></span>
                        <span>SL: <input type="number" id="sl-input-${trade.id}" value="${trade.sl !== null ? trade.sl : ''}" placeholder="Fiyat"></span>
                        <button onclick="updateTradeTPSL('${trade.id}', '${trade.symbol}', ${trade.entry_price}, '${trade.type}', ${trade.amount})">Güncelle</button>
                    </div>
                    <button onclick="closeTrade('${trade.id}', '${trade.symbol}', ${trade.entry_price}, '${trade.type}', ${trade.amount})">Kapat</button>
                `;
                activeTradesList.appendChild(tradeItem);
            }
        } else {
            activeTradesList.innerHTML += '<p>Açık işleminiz bulunmamaktadır.</p>';
        }
    } catch (error) {
        console.error('Açık işlemler çekilirken hata:', error);
    }
}

async function fetchTradeHistory() {
    const tradeHistoryList = document.getElementById('trade-history-list');
    tradeHistoryList.innerHTML = '<h3>İşlem Geçmişiniz:</h3>';
    try {
        const response = await fetchWithAuth(`${BASE_URL}/trade_history`);
        const data = await response.json();
        if (data.trade_history && data.trade_history.length > 0) {
            data.trade_history.forEach(trade => {
                const tradeItem = document.createElement('div');
                tradeItem.classList.add('trade-item');
                const profitLossClass = trade.profit_loss >= 0 ? 'profit' : 'loss';
                
                const isCrypto = ["BTCUSDT", "ETHUSDT", "SHIBUSDT", "PEPEUSDT", "SOLUSDT", "BNBUSDT", "LUNCUSDT", "DOGEUSDT", "XRPUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT"].includes(trade.symbol);
                const isJPY = ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY"].includes(trade.symbol);
                const isTRY = ["USD/TRY"].includes(trade.symbol);
                const isCommodity = ["XAU/USD", "WTI/USD", "XAG/USD", "NATGAS/USD"].includes(trade.symbol);

                let pricePrecision = 4;
                if (isCrypto) pricePrecision = 8;
                else if (isJPY) pricePrecision = 3;
                else if (isTRY || isCommodity) pricePrecision = 2;

                tradeItem.innerHTML = `
                    <span>ID: ${trade.id.substring(0, 8)}...</span>
                    <span>Sembol: ${trade.symbol}</span>
                    <span>Tip: ${trade.type}</span>
                    <span>Miktar: ${trade.amount}</span>
                    <span>Giriş F: ${trade.entry_price.toFixed(pricePrecision)}</span>
                    <span>Kapanış F: ${trade.closing_price.toFixed(pricePrecision)}</span>
                    <span class="${profitLossClass}">K/Z: ${trade.profit_loss.toFixed(2)} USD</span>
                    <span>Kapanış Zamanı: ${new Date(trade.closing_time).toLocaleString()}</span>
                `;
                tradeHistoryList.appendChild(tradeItem);
            });
        } else {
            tradeHistoryList.innerHTML += '<p>İşlem geçmişiniz bulunmamaktadır.</p>';
        }
    }
    catch (error) {
        console.error('İşlem geçmişi çekilirken hata:', error);
    }
}

async function fetchUserInfo() {
    try {
        const response = await fetchWithAuth(`${BASE_URL}/user_info`);
        const data = await response.json();
        if (response.ok) {
            document.getElementById('current-balance').textContent = data.bakiye.toFixed(2);
            document.getElementById('current-leverage').textContent = data.kaldirac;
            const leverageSelect = document.getElementById('leverage-select');
            leverageSelect.value = data.kaldirac;
            
            const adminPanelLink = document.getElementById('admin-panel-link');
            if (data.role === 'admin') {
                adminPanelLink.style.display = 'block';
            } else {
                adminPanelLink.style.display = 'none';
            }

        } else {
            showMessageModal(data.message || 'Kullanıcı bilgileri çekilirken hata oluştu.');
        }
    } catch (error) {
        console.error('Kullanıcı bilgileri çekilirken hata:', error);
    }
}

async function updateLeverage() {
    const newLeverage = document.getElementById('leverage-select').value;
    try {
        const response = await fetchWithAuth(`${BASE_URL}/update_leverage`, {
            method: 'POST',
            body: JSON.stringify({ leverage: parseInt(newLeverage) })
        });
        const data = await response.json();
        if (response.ok) {
            showMessageModal(data.message);
            fetchUserInfo();
        } else {
            showMessageModal(data.message || 'Kaldıraç güncellenirken hata oluştu.');
        }
    } catch (error) {
        console.error('Kaldıraç güncelleme hatası:', error);
    }
}

async function sendDepositWithdrawRequest(type) {
    const amount = document.getElementById('deposit-withdraw-amount').value;
    const message = document.getElementById('deposit-withdraw-message').value;

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        showMessageModal('Lütfen geçerli bir miktar girin.');
        return;
    }

    try {
        const response = await fetchWithAuth(`${BASE_URL}/deposit_withdraw_request`, {
            method: 'POST',
            body: JSON.stringify({ type: type, amount: parseFloat(amount), message: message })
        });
        const data = await response.json();
        if (response.ok) {
            showMessageModal(data.message);
            document.getElementById('deposit-withdraw-amount').value = '';
            document.getElementById('deposit-withdraw-message').value = '';
            fetchUserInfo();
        } else {
            showMessageModal(data.message || 'Talebiniz gönderilirken hata oluştu.');
        }
    } catch (error) {
        console.error('Para yatırma/çekme talebi hatası:', error);
    }
}

// ***************************************************************
// ADMİN PANELİ FONKSİYONLARI
// ***************************************************************

async function loadAdminUsers() {
    const adminUsersList = document.getElementById('admin-users-list');
    adminUsersList.innerHTML = '<h3>Tüm Kullanıcılar:</h3>';
    try {
        const response = await fetchWithAuth(`${BASE_URL}/admin/users`);
        const data = await response.json();
        if (response.ok && data.users) {
            for (const username in data.users) {
                const userData = data.users[username];
                const userDiv = document.createElement('div');
                userDiv.innerHTML = `
                    <p><strong>Kullanıcı Adı:</strong> ${username}</p>
                    <p><strong>E-posta:</strong> ${userData.email || 'Yok'}</p>
                    <p><strong>Telefon:</strong> ${userData.phone || 'Yok'}</p>
                    <p><strong>Bakiye:</strong> ${userData.bakiye.toFixed(2)} USD</p>
                    <p><strong>Kaldıraç:</strong> ${userData.kaldirac}x</p>
                    <p><strong>İşlem Geçmişi Sayısı:</strong> ${userData.islem_gecmisi_sayisi}</p>
                    <p><strong>Açık İşlem Sayısı:</strong> ${userData.acik_islem_sayisi}</p>
                    <button onclick="loadUserTransactions('${username}')">İşlemleri Gör</button>
                `;
                adminUsersList.appendChild(userDiv);
            }
        } else {
            showMessageModal(data.message || 'Kullanıcılar yüklenirken hata oluştu.');
        }
    } catch (error) {
        console.error('Admin kullanıcıları yüklenirken hata:', error);
    }
}

async function loadUserTransactions(username) {
    const adminUsersList = document.getElementById('admin-users-list');
    adminUsersList.innerHTML = `<h3>${username} İşlem Detayları:</h3>`;
    try {
        const response = await fetchWithAuth(`${BASE_URL}/admin/user_transactions/${username}`);
        const data = await response.json();
        if (response.ok) {
            adminUsersList.innerHTML += '<h4>Açık İşlemler:</h4>';
            if (data.active_trades && data.active_trades.length > 0) {
                data.active_trades.forEach(trade => {
                    adminUsersList.innerHTML += `
                        <p>ID: ${trade.id.substring(0,8)}..., Sembol: ${trade.symbol}, Tip: ${trade.type}, Miktar: ${trade.amount}, Giriş Fiyatı: ${trade.entry_price.toFixed(4)}</p>
                    `;
                });
            } else {
                adminUsersList.innerHTML += '<p>Açık işlem yok.</p>';
            }

            adminUsersList.innerHTML += '<h4>İşlem Geçmişi:</h4>';
            if (data.trade_history && data.trade_history.length > 0) {
                data.trade_history.forEach(trade => {
                    const profitLossClass = trade.profit_loss >= 0 ? 'profit' : 'loss';
                    adminUsersList.innerHTML += `
                        <p>ID: ${trade.id.substring(0,8)}..., Sembol: ${trade.symbol}, Tip: ${trade.type}, K/Z: <span class="${profitLossClass}">${trade.profit_loss.toFixed(2)} USD</span></p>
                    `;
                });
            } else {
                adminUsersList.innerHTML += '<p>İşlem geçmişi yok.</p>';
            }
            adminUsersList.innerHTML += '<button onclick="loadAdminUsers()">Geri</button>';
        } else {
            showMessageModal(data.message || 'Kullanıcı işlemleri yüklenirken hata oluştu.');
        }
    } catch (error) {
        console.error('Kullanıcı işlemleri yüklenirken hata:', error);
    }
}

async function loadAdminMessages() {
    const adminMessagesList = document.getElementById('admin-messages-list');
    adminMessagesList.innerHTML = '<h3>Bekleyen Yatırım/Çekim Mesajları:</h3>';
    try {
        const response = await fetchWithAuth(`${BASE_URL}/admin/messages`);
        const data = await response.json();
        if (response.ok && data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                const msgDiv = document.createElement('div');
                msgDiv.innerHTML = `
                    <p><strong>Kullanıcı:</strong> ${msg.username}</p>
                    <p><strong>Tip:</strong> ${msg.type === 'deposit' ? 'Para Yatırma' : 'Para Çekme'}</p>
                    <p><strong>Miktar:</strong> ${msg.amount} USD</p>
                    <p><strong>Mesaj:</strong> ${msg.message}</p>
                    <p><strong>Zaman:</strong> ${new Date(msg.timestamp).toLocaleString()}</p>
                    <p><strong>Durum:</strong> ${msg.status}</p>
                    <hr>
                `;
                adminMessagesList.appendChild(msgDiv);
            });
        } else {
            showMessageModal('Bekleyen mesaj bulunmamaktadır.');
        }
    } catch (error) {
        console.error('Admin mesajları yüklenirken hata:', error);
    }
}

async function addSignal() {
    const symbol = document.getElementById('signal-symbol').value;
    const type = document.getElementById('signal-type').value;
    const entryPrice = document.getElementById('signal-entry-price').value;
    const tp = document.getElementById('signal-tp').value;
    const sl = document.getElementById('signal-sl').value;

    if (!symbol || !type || !entryPrice || !tp || !sl) {
        showMessageModal('Tüm sinyal alanlarını doldurun.');
        return;
    }

    try {
        const response = await fetchWithAuth(`${BASE_URL}/admin/add_signal`, {
            method: 'POST',
            body: JSON.stringify({
                symbol,
                type,
                entry_price: parseFloat(entryPrice),
                tp: parseFloat(tp),
                sl: parseFloat(sl)
            })
        });
        const data = await response.json();
        if (response.ok) {
            showMessageModal(data.message);
            document.getElementById('signal-symbol').value = '';
            document.getElementById('signal-entry-price').value = '';
            document.getElementById('signal-tp').value = '';
            document.getElementById('signal-sl').value = '';
            fetchSignals();
        } else {
            showMessageModal(data.message || 'Sinyal eklenirken hata oluştu.');
        }
    } catch (error) {
        console.error('Sinyal ekleme hatası:', error);
    }
}

async function fetchSignals() {
    const signalsListDiv = document.getElementById('signals-list');
    signalsListDiv.innerHTML = '<h3>Aktif Sinyaller:</h3>';
    try {
        const response = await fetch(`${BASE_URL}/signals`);
        const data = await response.json();
        if (response.ok && data.signals && data.signals.length > 0) {
            data.signals.forEach(signal => {
                const signalItem = document.createElement('div');
                signalItem.classList.add('signal-item');
                const signalTypeClass = signal.type === 'BUY' ? 'buy' : 'sell';
                signalItem.innerHTML = `
                    <span>Sembol: ${signal.symbol}</span>
                    <span>Tip: <span class="signal-type ${signalTypeClass}">${signal.type}</span></span>
                    <span>Giriş Fiyatı: ${signal.entry_price.toFixed(4)}</span>
                    <span>TP: ${signal.tp.toFixed(4)}</span>
                    <span>SL: ${signal.sl.toFixed(4)}</span>
                    <span>Zaman: ${new Date(signal.timestamp).toLocaleString()}</span>
                `;
                signalsListDiv.appendChild(signalItem);
            });
        } else {
            showMessageModal('Aktif sinyal bulunmamaktadır.');
        }
    } catch (error) {
        console.error('Sinyaller çekilirken hata:', error);
        showMessageModal('Sinyaller yüklenirken bir hata oluştu.');
    }
}