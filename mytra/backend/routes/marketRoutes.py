from flask import Blueprint, jsonify
import requests

market_bp = Blueprint('market_bp', __name__)

@market_bp.route('/', methods=['GET'])
def get_all_data():
    try:
        # CoinGecko örneği – kripto verisi
        coingecko_url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
        response = requests.get(coingecko_url)
        crypto_data = response.json()

        # Döviz örneği – ExchangeRate.host (ücretsiz)
        forex_url = 'https://api.exchangerate.host/latest?base=USD&symbols=EUR,TRY'
        forex_response = requests.get(forex_url)
        forex_data = forex_response.json()

        # Altın gibi maden örneği (manuel mock veri)
        metal_data = {
            "XAU/USD": {
                "price": 2415.27,
                "change": "+0.2%"
            }
        }

        return jsonify({
            "crypto": crypto_data,
            "forex": forex_data,
            "metals": metal_data
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
