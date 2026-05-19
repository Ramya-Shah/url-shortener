import string

ALPHABET = string.ascii_letters + string.digits
BASE = len(ALPHABET)

def encode_base62(num: int) -> str:
    """Encode an integer to a Base62 string."""
    if num == 0:
        return ALPHABET[0]
    
    arr = []
    while num:
        num, rem = divmod(num, BASE)
        arr.append(ALPHABET[rem])
    
    arr.reverse()
    return "".join(arr)

def decode_base62(code: str) -> int:
    """Decode a Base62 string to an integer."""
    num = 0
    for char in code:
        num = num * BASE + ALPHABET.index(char)
    return num
