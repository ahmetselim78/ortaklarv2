#!/usr/bin/env python3
import base64
import os
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

mode, source, key_path, destination = sys.argv[1:5]
key = open(key_path, 'rb').read()
if len(key) != 32:
    raise SystemExit('AES-256 anahtarı 32 byte olmalıdır')
aad = b'OrtaklarV2-audit-v1'

if mode == 'encrypt':
    nonce = os.urandom(12)
    plaintext = open(source, 'rb').read()
    # Dosya yalnızca standart AES-GCM ciphertext+tag baytlarını taşır. Nonce ve
    # AAD manifesttedir; projeye özel bir dosya başlığı/formatı oluşturulmaz.
    with open(destination, 'wb') as output:
        output.write(AESGCM(key).encrypt(nonce, plaintext, aad))
    print(base64.b64encode(nonce).decode('ascii'))
elif mode == 'decrypt':
    nonce = base64.b64decode(os.environ['AUDIT_NONCE_B64'], validate=True)
    ciphertext = open(source, 'rb').read()
    with open(destination, 'wb') as output:
        output.write(AESGCM(key).decrypt(nonce, ciphertext, aad))
else:
    raise SystemExit('Kullanım: encrypt_audit.py encrypt|decrypt kaynak anahtar hedef')
