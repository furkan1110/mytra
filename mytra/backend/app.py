import os
from datetime import datetime, timedelta
from functools import wraps
import re
import requests # API istekleri için eklendi

import jwt
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = 'your_super_secret_key_that_is_long_and_random_1234567890' # GÜÇLÜ VE BENZERSİZ BİR GİZLİ ANAHTAR İLE DEĞİŞTİRİN!
TWELVE_DATA_API_KEY = "73632c46b5464ad8873a55d651e2bbb2" # Twelve Data API anahtarınız

# Binance API URL'si (Public API, API Key gerektirmez sadece fiyat için)
BINANCE_API_BASE_URL = "https://api.binance.com/api/v3"

# Basit bir bellek içi veritabanı
users = {}
signals = []
admin_messages = []

# Admin için demo kullanıcı ekleyelim
if "admin" not in users:
    users["admin"] = {
        "password_hash": generate_password_hash("adminpass", method='pbkdf2:sha256'),
        "email": "admin@mytra-fx.com",
        "phone": "+905001112233",
        "bakiye": 9999999.0, # Adminin daha yüksek bakiyesi
        "kaldirac": 500,
        "islem_gecmisi": [],
        "acik_islemler": [],
        "role": "admin"
    }


# Telefon Numarası Doğrulama Regex'leri ve Ön Ekleri
PHONE_VALIDATION_RULES = {
    "TR": {"prefix": "+90", "regex": r"^\+90\d{10}$", "length": 10},
    "US": {"prefix": "+1", "regex": r"^\+1\d{10}$", "length": 10},
    "GB": {"prefix": "+44", "regex": r"^\+44\d{10}$", "length": 10},
    "DE": {"prefix": "+49", "regex": r"^\+49\d{10}$", "length": 10},
}
DEFAULT_PHONE_REGEX = r"^\+\d{1,4}\d{6,15}$"

# --- Binance API Yardımcı Fonksiyonu ---
def get_binance_crypto_price(symbol_pair_binance_format):
    """
    Binance API'sinden anlık kripto fiyatını çeker.
    Örnek: BTCUSDT, ETHUSDT
    """
    try:
        response = requests.get(f"{BINANCE_API_BASE_URL}/ticker/price?symbol={symbol_pair_binance_format}")
        response.raise_for_status() 
        data = response.json()
        price = float(data['price'])
        # Binance tek fiyat döner, bid/ask için küçük bir simülasyon yapalım
        crypto_spread_value = 100.0 # Kripto için 100 birim spread (100 dolar veya ilgili birim)
        if "SHIB" in symbol_pair_binance_format or "PEPE" in symbol_pair_binance_format or "LUNC" in symbol_pair_binance_format:
            crypto_spread_value = 0.0000001 * price * 100 # Çok küçük fiyatlılar için farklı spread
        
        return {"bid_price": price - crypto_spread_value / 2, "ask_price": price + crypto_spread_value / 2}
    except requests.exceptions.RequestException as e:
        print(f"Binance API hatası ({symbol_pair_binance_format}): {e}")
        return None
    except KeyError:
        print(f"Binance API yanıtında 'price' bulunamadı veya geçersiz sembol: {symbol_pair_binance_format}")
        return None

# JWT Kimlik Doğrulama Dekoratorü
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]

        if not token:
            return jsonify({'message': 'Token eksik!'}), 401

        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user_username = data['username']
            current_user_obj = users.get(current_user_username)

            if not current_user_obj:
                return jsonify({'message': 'Kullanıcı bulunamadı!'}), 401

            return f(current_user_obj, *args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Oturumunuzun süresi doldu! Lütfen tekrar giriş yapın.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Geçersiz token!'}), 401

    return decorated

# --- Kimlik Doğrulama ve Kullanıcı Yönetimi ---

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    raw_phone = data.get('phone') 
    country_code = data.get('country_code', 'DEFAULT') 

    if not username or not password or not email or not raw_phone:
        return jsonify({'message': 'Kullanıcı adı, şifre, e-posta ve telefon numarası gerekli!'}), 400

    if username in users:
        return jsonify({'message': 'Bu kullanıcı adı zaten mevcut!'}), 409
    
    if len(password) < 6:
        return jsonify({'message': 'Şifreniz en az 6 karakter olmalıdır!'}), 400

    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email):
        return jsonify({'message': 'Geçersiz e-posta formatı!'}), 400

    phone_prefix = PHONE_VALIDATION_RULES.get(country_code, {}).get("prefix", "")
    full_phone_number = phone_prefix + raw_phone 
    
    validation_rule = PHONE_VALIDATION_RULES.get(country_code)
    if validation_rule:
        regex = validation_rule["regex"]
        expected_length = validation_rule["length"]
        if not re.fullmatch(regex, full_phone_number) or len(raw_phone) != expected_length:
            return jsonify({'message': f'Geçersiz telefon numarası formatı! Lütfen {country_code} için {phone_prefix} sonrası {expected_length} hane girin.'}), 400
    else:
        if not re.fullmatch(DEFAULT_PHONE_REGEX, full_phone_number):
            return jsonify({'message': 'Geçersiz telefon numarası formatı! Lütfen ülke koduyla birlikte doğru formatı kullanın (örn: +12345678901).'}), 400

    for u_name, u_data in users.items():
        if u_data.get('email') == email:
            return jsonify({'message': 'Bu e-posta adresi zaten kullanılıyor!'}), 409
        if u_data.get('phone') == full_phone_number:
            return jsonify({'message': 'Bu telefon numarası zaten kullanılıyor!'}), 409

    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
    users[username] = {
        "password_hash": hashed_password,
        "email": email,
        "phone": full_phone_number,
        "country_code": country_code,
        "bakiye": 0.0, # Kayıtta bakiye 0
        "kaldirac": 100,
        "islem_gecmisi": [],
        "acik_islemler": [],
        "role": "user"
    }
    return jsonify({'message': 'Kayıt başarılı!'}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = users.get(username)

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({'message': 'Geçersiz kullanıcı adı veya şifre!'}), 401

    token = jwt.encode({
        'username': username,
        'exp': datetime.utcnow() + timedelta(minutes=60)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    return jsonify({'token': token, 'username': username, 'role': user.get('role', 'user')}), 200

@app.route('/demo_login', methods=['POST'])
def demo_login():
    demo_username = "demo_user"
    if demo_username not in users:
        users[demo_username] = {
            "password_hash": generate_password_hash("demopass", method='pbkdf2:sha256'),
            "email": "demo@example.com",
            "phone": "+905551234567",
            "country_code": "TR",
            "bakiye": 5000.0,
            "kaldirac": 200,
            "islem_gecmisi": [],
            "acik_islemler": [],
            "role": "user"
        }
    token = jwt.encode({
        'username': demo_username,
        'exp': datetime.utcnow() + timedelta(minutes=60)
    }, app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'username': demo_username, 'role': 'user'}), 200

# --- Kullanıcı Bilgileri ve Ayarlar ---

@app.route('/user_info', methods=['GET'])
@token_required
def get_user_info(current_user_obj):
    username = next((uname for uname, uobj in users.items() if uobj == current_user_obj), None)
    
    return jsonify({
        'username': username,
        'bakiye': current_user_obj['bakiye'],
        'kaldirac': current_user_obj['kaldirac'],
        'role': current_user_obj.get('role', 'user')
    }), 200

@app.route('/update_leverage', methods=['POST'])
@token_required
def update_leverage(current_user_obj):
    data = request.get_json()
    new_leverage = data.get('leverage')
    if new_leverage not in [100, 200, 500]:
        return jsonify({'message': 'Geçersiz kaldıraç değeri! Sadece 100, 200, 500 kabul edilir.'}), 400
    current_user_obj['kaldirac'] = new_leverage
    return jsonify({'message': 'Kaldıraç güncellendi.', 'new_leverage': new_leverage}), 200

# --- İşlem Yönetimi ---

@app.route('/open_trade', methods=['POST'])
@token_required
def open_trade(current_user_obj):
    data = request.get_json()
    symbol = data.get('symbol')
    trade_type = data.get('type')  # 'BUY' veya 'SELL'
    amount = float(data.get('amount'))
    price_for_trade = float(data.get('price_for_trade'))
    tp = float(data.get('tp')) if data.get('tp') else None
    sl = float(data.get('sl')) if data.get('sl') else None

    user_data = current_user_obj
    
    # Adminler için bakiye/marjin kontrolünü atla
    if user_data.get('role') != 'admin':
        if user_data['bakiye'] < 200:
            return jsonify({'message': 'Bakiyeniz 200 USD altında olduğu için işlem açamazsınız. Lütfen para yatırın.'}), 400

        required_margin = (amount * price_for_trade) / user_data['kaldirac']
        
        if user_data['bakiye'] < required_margin:
            return jsonify({'message': 'Yetersiz bakiye! İşlem açmak için yeterli teminatınız yok. (Gerekli Marjin: {:.2f} USD)'.format(required_margin)}), 400
        
    if amount <= 0:
        return jsonify({'message': 'Geçersiz işlem miktarı!'}), 400


    trade_id = f"TRD-{datetime.now().timestamp()}"
    new_trade = {
        "id": trade_id,
        "symbol": symbol,
        "type": trade_type,
        "amount": amount,
        "entry_price": price_for_trade,
        "opening_time": datetime.utcnow().isoformat(),
        "tp": tp,
        "sl": sl,
        "margin_percentage": 100
    }
    # Eğer admin değilse bakiyeden düş
    if user_data.get('role') != 'admin':
        required_margin_for_deduction = (amount * price_for_trade) / user_data['kaldirac']
        user_data['bakiye'] -= required_margin_for_deduction

    user_data['acik_islemler'].append(new_trade)

    return jsonify({'message': 'İşlem açıldı!', 'trade': new_trade}), 200

@app.route('/close_trade', methods=['POST'])
@token_required
def close_trade(current_user_obj):
    data = request.get_json()
    trade_id = data.get('trade_id')
    closing_price = float(data.get('closing_price')) 

    user_data = current_user_obj
    trade_to_close = None
    for trade in user_data['acik_islemler']:
        if trade['id'] == trade_id:
            trade_to_close = trade
            break

    if not trade_to_close:
        return jsonify({'message': 'İşlem bulunamadı!'}), 404

    opening_time_str = trade_to_close['opening_time']
    opening_time = datetime.fromisoformat(opening_time_str)
    if (datetime.utcnow() - opening_time).total_seconds() < 15:
        return jsonify({'message': 'Scalping yasaktır! İşlemi 15 saniyeden önce kapatamazsınız.'}), 400

    profit_loss = 0.0
    if trade_to_close['type'] == 'BUY':
        profit_loss = (closing_price - trade_to_close['entry_price']) * trade_to_close['amount']
    elif trade_to_close['type'] == 'SELL':
        profit_loss = (trade_to_close['entry_price'] - closing_price) * trade_to_close['amount']

    initial_margin = (trade_to_close['amount'] * trade_to_close['entry_price']) / user_data['kaldirac']
    user_data['bakiye'] += initial_margin + profit_loss 

    user_data['acik_islemler'].remove(trade_to_close)

    user_data['islem_gecmisi'].append({
        "id": trade_id,
        "symbol": trade_to_close['symbol'],
        "type": trade_to_close['type'],
        "amount": trade_to_close['amount'],
        "entry_price": trade_to_close['entry_price'],
        "closing_price": closing_price,
        "profit_loss": profit_loss,
        "opening_time": trade_to_close['opening_time'],
        "closing_time": datetime.utcnow().isoformat()
    })

    return jsonify({'message': 'İşlem kapatıldı!', 'profit_loss': profit_loss, 'new_balance': user_data['bakiye']}), 200


@app.route('/update_trade_tpsl', methods=['POST'])
@token_required
def update_trade_tpsl(current_user_obj):
    data = request.get_json()
    trade_id = data.get('trade_id')
    new_tp = float(data.get('tp')) if data.get('tp') else None
    new_sl = float(data.get('sl')) if data.get('sl') else None

    user_data = current_user_obj
    trade_to_update = None
    for trade in user_data['acik_islemler']:
        if trade['id'] == trade_id:
            trade_to_update = trade
            break

    if not trade_to_update:
        return jsonify({'message': 'İşlem bulunamadı!'}), 404
    
    trade_to_update['tp'] = new_tp
    trade_to_update['sl'] = new_sl

    return jsonify({'message': 'TP/SL güncellendi!', 'trade': trade_to_update}), 200


@app.route('/active_trades', methods=['GET'])
@token_required
def get_active_trades(current_user_obj):
    return jsonify({'active_trades': current_user_obj['acik_islemler']}), 200

@app.route('/trade_history', methods=['GET'])
@token_required
def get_trade_history(current_user_obj):
    return jsonify({'trade_history': current_user_obj['islem_gecmisi']}), 200

# --- Piyasa Verisi Entegrasyonu ---

@app.route('/get_available_symbols', methods=['GET'])
def get_available_symbols():
    return jsonify({
        "symbols": [
            # Forex (Popüler majörler, minörler ve egzotikler)
            {"symbol": "EUR/USD", "name": "Euro/US Dollar", "type": "forex"},
            {"symbol": "GBP/USD", "name": "British Pound/US Dollar", "type": "forex"},
            {"symbol": "USD/JPY", "name": "US Dollar/Japanese Yen", "type": "forex"},
            {"symbol": "AUD/USD", "name": "Australian Dollar/US Dollar", "type": "forex"},
            {"symbol": "USD/CAD", "name": "US Dollar/Canadian Dollar", "type": "forex"},
            {"symbol": "USD/CHF", "name": "US Dollar/Swiss Franc", "type": "forex"}, 
            {"symbol": "NZD/USD", "name": "New Zealand Dollar/US Dollar", "type": "forex"}, 
            {"symbol": "EUR/GBP", "name": "Euro/British Pound", "type": "forex"}, 
            {"symbol": "EUR/JPY", "name": "Euro/Japanese Yen", "type": "forex"}, 
            {"symbol": "GBP/JPY", "name": "British Pound/Japanese Yen", "type": "forex"}, 
            {"symbol": "AUD/JPY", "name": "Australian Dollar/Japanese Yen", "type": "forex"}, 
            {"symbol": "USD/TRY", "name": "US Dollar/Turkish Lira", "type": "forex"}, 
            # Emtialar (Popüler olanlar)
            {"symbol": "XAU/USD", "name": "Gold/US Dollar", "type": "commodity"},     # Altın
            {"symbol": "WTI/USD", "name": "Crude Oil/US Dollar", "type": "commodity"}, # Petrol
            {"symbol": "XAG/USD", "name": "Silver/US Dollar", "type": "commodity"},   # Gümüş
            {"symbol": "NATGAS/USD", "name": "Natural Gas/US Dollar", "type": "commodity"}, # Doğalgaz
            # Kripto (Binance formatında, USDT pariteleri)
            {"symbol": "BTCUSDT", "name": "Bitcoin/USDT", "type": "crypto"},
            {"symbol": "ETHUSDT", "name": "Ethereum/USDT", "type": "crypto"},
            {"symbol": "SHIBUSDT", "name": "Shiba Inu/USDT", "type": "crypto"},
            {"symbol": "PEPEUSDT", "name": "Pepe/USDT", "type": "crypto"},
            {"symbol": "SOLUSDT", "name": "Solana/USDT", "type": "crypto"},
            {"symbol": "BNBUSDT", "name": "Binance Coin/USDT", "type": "crypto"},
            {"symbol": "LUNCUSDT", "name": "Terra Classic/USDT", "type": "crypto"},
            {"symbol": "DOGEUSDT", "name": "Dogecoin/USDT", "type": "crypto"},
            {"symbol": "XRPUSDT", "name": "Ripple/USDT", "type": "crypto"},
            {"symbol": "ADAUSDT", "name": "Cardano/USDT", "type": "crypto"},
            {"symbol": "DOTUSDT", "name": "Polkadot/USDT", "type": "crypto"},
            {"symbol": "LINKUSDT", "name": "Chainlink/USDT", "type": "crypto"},
        ]
    })

@app.route('/get_price/<path:symbol>', methods=['GET'])
def get_price(symbol):
    decoded_symbol = symbol.replace('%2F', '/')

    # Kripto pariteleri için Binance API'sini kullan
    if decoded_symbol.endswith("USDT") or decoded_symbol.split('/')[0] in ["BTC", "ETH", "XRP", "SHIB", "PEPE", "SOL", "BNB", "LUNC", "DOGE", "ADA", "DOT", "LINK"]:
        binance_symbol = decoded_symbol.replace('/', '')
        if binance_symbol.endswith("USD"): # Eğer USD bazlı geldiyse USDT yap (örn: BTC/USD -> BTCUSDT)
            binance_symbol = binance_symbol.replace("USD", "USDT")
        
        crypto_prices = get_binance_crypto_price(binance_symbol)
        if crypto_prices:
            return jsonify({'symbol': decoded_symbol, 'bid_price': crypto_prices["bid_price"], 'ask_price': crypto_prices["ask_price"]})
        else:
            return jsonify({'message': f'{decoded_symbol} için Binance fiyatı alınamadı.'}), 500

    # Forex ve Emtialar için mock fiyatlar (Bid/Ask spread ile)
    
    base_prices = { # Yaklaşık orta fiyatlar
        "EUR/USD": 1.0850, "GBP/USD": 1.2700, "USD/JPY": 157.00,
        "AUD/USD": 0.6650, "USD/CAD": 1.3650, "USD/CHF": 0.9000, "NZD/USD": 0.6100, "EUR/GBP": 0.8500,
        "EUR/JPY": 170.00, "GBP/JPY": 200.00, "AUD/JPY": 105.00,
        "USD/TRY": 32.50, 
        "XAU/USD": 2300.00, "WTI/USD": 80.00, "XAG/USD": 29.00, "NATGAS/USD": 2.80,
    }
    
    current_base_price = base_prices.get(decoded_symbol)
    if current_base_price is None:
        return jsonify({'message': f'Sembol {decoded_symbol} için fiyat bilgisi bulunamadı.'}), 404

    # Spread değerleri (100 birim)
    # Forex için 10 pip = 0.0010 (majörler), JPY pariteleri için 0.10
    # Emtialar için 100 birim doğrudan fiyat farkı
    spread_definitions = {
        "EUR/USD": 0.0010, "GBP/USD": 0.0010, "USD/JPY": 0.10, 
        "AUD/USD": 0.0010, "USD/CAD": 0.0010, "USD/CHF": 0.0010, "NZD/USD": 0.0010, "EUR/GBP": 0.0010,
        "EUR/JPY": 0.10, "GBP/JPY": 0.10, "AUD/JPY": 0.10,
        "USD/TRY": 0.10, # TRY pariteleri için 10 birim
        "XAU/USD": 1.00, "WTI/USD": 0.10, "XAG/USD": 0.10, "NATGAS/USD": 0.01,
    }
    spread_value_in_units = spread_definitions.get(decoded_symbol, 0.0010) # Bulamazsa varsayılan

    random_fluctuation = (datetime.now().second % 10 - 5) * (current_base_price * 0.00001) 

    ask_price = current_base_price + random_fluctuation + (spread_value_in_units / 2)
    bid_price = current_base_price + random_fluctuation - (spread_value_in_units / 2)

    return jsonify({'symbol': decoded_symbol, 'bid_price': bid_price, 'ask_price': ask_price})

@app.route('/get_historical_data/<path:symbol>/<interval>', methods=['GET'])
def get_historical_data(symbol, interval):
    decoded_symbol = symbol.replace('%2F', '/')

    base_prices_history = {
        "EUR/USD": 1.0800, "GBP/USD": 1.2700, "USD/JPY": 157.00, "AUD/USD": 0.6650,
        "USD/CAD": 1.3650, "USD/CHF": 0.9000, "NZD/USD": 0.6100, "EUR/GBP": 0.8500,
        "EUR/JPY": 169.00, "GBP/JPY": 199.00, "AUD/JPY": 104.00,
        "USD/TRY": 32.00, "XAU/USD": 2250.00, "WTI/USD": 78.00,
        "XAG/USD": 28.00, "NATGAS/USD": 2.50,
        "BTCUSDT": 60000.00, "ETHUSDT": 3000.00, "SHIBUSDT": 0.000008,
        "PEPEUSDT": 0.000001, "SOLUSDT": 150.00, "BNBUSDT": 550.00,
        "LUNCUSDT": 0.0001, "DOGEUSDT": 0.12, "XRPUSDT": 0.45, "ADAUSDT": 0.35,
        "DOTUSDT": 6.00, "LINKUSDT": 14.00,
    }

    now = datetime.utcnow()
    mock_values = []
    
    num_data_points = 10 

    for i in range(num_data_points):
        data_time = now - timedelta(minutes=(num_data_points - 1 - i))
        
        if interval == '1min':
            data_time = now - timedelta(minutes=(num_data_points - 1 - i))
        elif interval == '5min':
            data_time = now - timedelta(minutes=(num_data_points - 1 - i) * 5)
        elif interval == '15min':
            data_time = now - timedelta(minutes=(num_data_points - 1 - i) * 15)
        elif interval == '30min':
            data_time = now - timedelta(minutes=(num_data_points - 1 - i) * 30)
        elif interval == '1h':
            data_time = now - timedelta(hours=(num_data_points - 1 - i))
        elif interval == '1day':
            data_time = now - timedelta(days=(num_data_points - 1 - i))
        else:
            data_time = now - timedelta(hours=(num_data_points - 1 - i))

        middle_base_price = base_prices_history.get(decoded_symbol, 1.0)
        
        price_fluctuation = (i - num_data_points / 2) * (middle_base_price * 0.0001) 
        
        open_price_val = middle_base_price + price_fluctuation
        close_price_val = open_price_val + ((data_time.second % 5 - 2) * (middle_base_price * 0.00001)) 
        high_price_val = max(open_price_val, close_price_val) + (middle_base_price * 0.00005)
        low_price_val = min(open_price_val, close_price_val) - (middle_base_price * 0.00005)

        rounding_precision = 4 
        if decoded_symbol in ["BTCUSDT", "ETHUSDT", "SHIBUSDT", "PEPEUSDT", "SOLUSDT", "BNBUSDT", "LUNCUSDT", "DOGEUSDT", "XRPUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT"]:
             rounding_precision = 8 
        elif decoded_symbol in ["USD/TRY", "XAU/USD", "WTI/USD", "XAG/USD", "NATGAS/USD", "USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY"]: 
            rounding_precision = 3 # JPY için 3, diğerleri için 2 (genel olarak 2, JPY özel)
        
        mock_values.append({
            "datetime": data_time.isoformat(),
            "open": round(open_price_val, rounding_precision),
            "high": round(high_price_val, rounding_precision),
            "low": round(low_price_val, rounding_precision),
            "close": round(close_price_val, rounding_precision),
            "volume": 1000 + i * 50
        })

    return jsonify({
        "status": "ok",
        "symbol": decoded_symbol,
        "interval": interval,
        "values": mock_values
    })

# --- Admin ve Mesajlaşma ---

@app.route('/deposit_withdraw_request', methods=['POST'])
@token_required
def deposit_withdraw_request(current_user_obj):
    data = request.get_json()
    request_type = data.get('type')
    amount = float(data.get('amount'))
    message = data.get('message')

    if amount <= 0:
        return jsonify({'message': 'Geçersiz miktar!'}), 400

    username = next((uname for uname, uobj in users.items() if uobj == current_user_obj), None)
    if not username:
        return jsonify({'message': 'Kullanıcı bilgisi bulunamadı.'}), 500

    # Adminler için bakiye kontrolünü atla
    if current_user_obj.get('role') != 'admin':
        if current_user_obj['bakiye'] < 200 and request_type == 'withdraw':
            return jsonify({'message': 'Bakiyeniz 200 USD altında olduğu için para çekme talebi oluşturamazsınız.'}), 400

        if request_type == 'withdraw':
            if current_user_obj['bakiye'] < amount:
                return jsonify({'message': 'Yetersiz bakiye!'}), 400
            if current_user_obj['bakiye'] - amount < 200:
                return jsonify({'message': 'Para çektikten sonra bakiyeniz 200 USD altına düşemez!'}), 400
        # Para yatırma işleminde bakiyeyi güncelle
        if request_type == 'deposit':
            current_user_obj['bakiye'] += amount 

    admin_messages.append({
        "username": username,
        "type": request_type,
        "amount": amount,
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
        "status": "pending"
    })
    return jsonify({'message': f'{request_type} talebiniz admine iletilmiştir.'}), 200

# --- Admin Paneli ---

@app.route('/admin/users', methods=['GET'])
# @token_required # Gerçekte admin için ayrı bir kimlik doğrulama veya rol kontrolü yapılmalı
def admin_get_all_users():
    clean_users = {}
    for uname, udata in users.items():
        clean_users[uname] = {
            "email": udata.get('email'),
            "phone": udata.get('phone'),
            "bakiye": udata['bakiye'],
            "kaldirac": udata['kaldirac'],
            "islem_gecmisi_sayisi": len(udata['islem_gecmisi']),
            "acik_islem_sayisi": len(udata['acik_islemler'])
        }
    return jsonify({'users': clean_users}), 200

@app.route('/admin/user_transactions/<username>', methods=['GET'])
# @token_required # Gerçekte admin için ayrı bir kimlik doğrulama veya rol kontrolü yapılmalı
def admin_get_user_transactions(username):
    user_data = users.get(username)
    if not user_data:
        return jsonify({'message': 'Kullanıcı bulunamadı.'}), 404
    return jsonify({
        'username': username,
        'trade_history': user_data['islem_gecmisi'],
        'active_trades': user_data['acik_islemler']
    }), 200

@app.route('/admin/messages', methods=['GET'])
# @token_required # Gerçekte admin için ayrı bir kimlik doğrulama veya rol kontrolü yapılmalı
def admin_get_messages():
    return jsonify({'messages': admin_messages}), 200

@app.route('/admin/add_signal', methods=['POST'])
# @token_required # Gerçekte admin için ayrı bir kimlik doğrulama veya rol kontrolü yapılmalı
def admin_add_signal():
    data = request.get_json()
    symbol = data.get('symbol')
    signal_type = data.get('type')
    entry_price = data.get('entry_price')
    tp = data.get('tp')
    sl = data.get('sl')

    if not all([symbol, signal_type, entry_price, tp, sl]):
        return jsonify({'message': 'Tüm sinyal alanları gerekli!'}), 400

    signal_id = f"SGN-{datetime.now().timestamp()}"
    new_signal = {
        "id": signal_id,
        "symbol": symbol,
        "type": signal_type,
        "entry_price": entry_price,
        "tp": tp,
        "sl": sl,
        "timestamp": datetime.utcnow().isoformat()
    }
    signals.append(new_signal)
    return jsonify({'message': 'Sinyal eklendi!', 'signal': new_signal}), 201

@app.route('/signals', methods=['GET'])
def get_signals():
    return jsonify({'signals': signals}), 200

# --- Marjin Kontrolü (Simülasyon) ---

@app.before_request
def check_margins():
    pass


if __name__ == '__main__':
    app.run(debug=True, port=5000)

# Geliştirici: gemini&mytra-fx