import jwt
import requests
from functools import wraps
from flask import request, jsonify

# 🛡️ AZURE AD CONFIGURATION
TENANT_ID = "35308931-eced-4972-abaa-eabe34f2b76e" 
CLIENT_ID = "a5b16a58-3a7e-497d-aabc-bb969cdd183e"

# Allow both formats to prevent "Audience doesn't match"
ALLOWED_AUDIENCES = [CLIENT_ID, f"api://{CLIENT_ID}"]

ALLOWED_ISSUERS = [
    f"https://login.microsoftonline.com/{TENANT_ID}/v2.0",
    f"https://sts.windows.net/{TENANT_ID}/", # ✅ Add this line (with the trailing slash)
    "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0" # Personal Accounts
]

JWKS_URI = "https://login.microsoftonline.com/common/discovery/v2.0/keys"
jwks_client = None

def get_public_key(kid):
    global jwks_client
    if not jwks_client:
        jwks_client = requests.get(JWKS_URI).json()
    for key in jwks_client['keys']:
        if key['kid'] == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key)
    return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200

        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({'message': 'Token is missing!'}), 401
        
        token = auth_header.split(" ")[1]

        try:
            header = jwt.get_unverified_header(token)
            public_key = get_public_key(header.get('kid'))
            
            # ✅ Validates against the list of allowed audiences
            payload = jwt.decode(
                token, 
                public_key, 
                algorithms=['RS256'], 
                audience=ALLOWED_AUDIENCES, 
                options={"verify_iss": False}
            )
            
            issuer = payload.get('iss')
            if issuer not in ALLOWED_ISSUERS:
                return jsonify({'message': f'Invalid Issuer: {issuer}'}), 401

            request.user = payload # Injects roles and name into request
            # print(f"✅ [AUTH] User Validated: {payload.get('name', 'Unknown')}")
            
        except jwt.ExpiredSignatureError:
            print("❌ [AUTH] Token Expired")
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError as e:
            print(f"❌ [AUTH] Invalid Token: {str(e)}")
            return jsonify({'message': f'Invalid Token: {str(e)}'}), 401
        except Exception as e:
            print(f"❌ [AUTH] Unexpected Error: {str(e)}")
            return jsonify({'message': f'Auth Error: {str(e)}'}), 500

        return f(*args, **kwargs)
    return decorated

def role_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_roles = getattr(request, 'user', {}).get('roles', [])
            if required_role not in user_roles:
                return jsonify({'message': f'Access Denied: Requires {required_role}'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def permission_required(required_perm):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):

            if not hasattr(request, 'user'):
                return jsonify({'message': 'Authentication required'}), 401
            
            user_data = request.user
            email = (user_data.get('preferred_username') or user_data.get('email') or "").strip().lower()

            from database import query_db

            user_role = query_db("""
                SELECT r.permissions 
                FROM app_users u 
                JOIN roles r ON u.role_id = r.id 
                WHERE LOWER(u.email) = ?
            """, (email,), one=True)

            if not user_role:
                print(f"❌ [RBAC] No Role assigned for {email}")
                return jsonify({'message': 'Access Denied: No Role Assigned'}), 403
            
            permissions = user_role['permissions'].split(',')

            if 'ALL_ACCESS' in permissions or required_perm in permissions:
                return f(*args, **kwargs)

            print(f"⛔ [RBAC] Permission '{required_perm}' denied for {email}")
            return jsonify({'message': f'Access Denied: Requires {required_perm}'}), 403
                
        return decorated_function
    return decorator