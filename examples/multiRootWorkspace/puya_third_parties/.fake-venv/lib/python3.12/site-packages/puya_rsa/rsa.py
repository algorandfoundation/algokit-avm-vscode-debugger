from algopy import Bytes, subroutine, UInt64
from algopy.op import bzero

from puya_bignumber import (
    less_than,
    modexp_barrett_reduce,
    equal,
    modexp_barrett_reduce_post_validation,
)

__all__ = [
    "pkcs1_v15_verify",
    "pkcs1_v15_verify_without_barrett_validation",
]


# RSASSA-PKCS1-V1_5-VERIFY ((n, e), M, S) implementation. See https://datatracker.ietf.org/doc/html/rfc8017#section-8.2.2.
@subroutine
def pkcs1_v15_verify(
    msg_digest_info: Bytes,
    s: Bytes,
    n: Bytes,
    e: Bytes,
    barrett_reduction_factor: Bytes,
) -> None:
    k: UInt64 = n.length
    assert s.length == k, "signature must have the same length as the modulus"

    # RSAVP1
    assert less_than(s, n), "signature representative out of range"
    m: Bytes = modexp_barrett_reduce(s, e, n, barrett_reduction_factor)

    # I2OSP
    assert m.length == k, "m too large"
    em: Bytes = m

    # EMSA_PKCS1_v15
    assert k >= msg_digest_info.length + 11, "intended encoded message length too short"
    PS: Bytes = ~bzero(k - msg_digest_info.length - 3)
    em_prime: Bytes = b"\x00\x01" + PS + b"\x00" + msg_digest_info

    assert equal(em, em_prime), "em must match em_prime for signature to be valid"


# RSASSA-PKCS1-V1_5-VERIFY ((n, e), M, S) without Barrett Reduction Assumption Validation
@subroutine
def pkcs1_v15_verify_without_barrett_validation(
    msg_digest_info: Bytes,
    s: Bytes,
    n: Bytes,
    e: Bytes,
    barrett_reduction_factor: Bytes,
) -> None:
    k: UInt64 = n.length
    assert s.length == k, "signature must have the same length as the modulus"

    # RSAVP1
    assert less_than(s, n), "signature representative out of range"
    m: Bytes = modexp_barrett_reduce_post_validation(s, e, n, barrett_reduction_factor)

    # I2OSP
    assert m.length == k, "m too large"
    em: Bytes = m

    # EMSA_PKCS1_v15
    assert k >= msg_digest_info.length + 11, "intended encoded message length too short"
    PS: Bytes = ~bzero(k - msg_digest_info.length - 3)
    em_prime: Bytes = b"\x00\x01" + PS + b"\x00" + msg_digest_info

    assert equal(em, em_prime), "em must match em_prime for signature to be valid"
