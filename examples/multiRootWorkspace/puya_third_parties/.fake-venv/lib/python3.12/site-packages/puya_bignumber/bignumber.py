from algopy import arc4, Bytes, subroutine, BigUInt, UInt64, urange
from algopy.op import substring, bzero, concat, extract, itob, btoi, getbit
from .common import (
    pad,
    max_value,
    enclosing_multiple,
    pad_as_multiple,
    decode_dynamic_bytes,
)
import typing

__all__ = [
    "add",
    "subtract",
    "equal",
    "multiply",
    "divide",
    "less_than",
    "greater_than",
    "barrett_reducer_factor",
    "mod_barrett_reduce",
    "modexp_barrett_reduce",
    "modexp_barrett_reduce_assumption_validation",
    "modexp_barrett_reduce_post_validation",
]

BIGINT_BYTE_SIZE_INT: int = 64
UINT256_BYTE_SIZE_INT: int = 32
BASE_UINT256_INT: int = 2**256
UInt256: typing.TypeAlias = arc4.BigUIntN[typing.Literal[256]]


@subroutine
def add(a: Bytes, b: Bytes) -> Bytes:
    BIGINT_BYTE_SIZE: UInt64 = UInt64(BIGINT_BYTE_SIZE_INT)
    length: UInt64 = enclosing_multiple(max_value(a.length, b.length), BIGINT_BYTE_SIZE)
    a_digits: Bytes = pad(a, length)
    b_digits: Bytes = pad(b, length)

    n: UInt64 = a_digits.length // BIGINT_BYTE_SIZE
    result: Bytes = Bytes(b"")
    carry: UInt64 = UInt64(0)
    for i in reversed(urange(n)):
        a_digit: BigUInt = BigUInt.from_bytes(
            extract(a_digits, i * BIGINT_BYTE_SIZE, BIGINT_BYTE_SIZE)
        )
        b_digit: BigUInt = BigUInt.from_bytes(
            extract(b_digits, i * BIGINT_BYTE_SIZE, BIGINT_BYTE_SIZE)
        )

        sum: BigUInt = a_digit + b_digit
        sum_bytes: Bytes = pad(sum.bytes, BIGINT_BYTE_SIZE + 1)
        sum_carry = btoi(sum_bytes[0])

        ab_carry: BigUInt = BigUInt.from_bytes(sum_bytes[1:]) + carry
        ab_carry_bytes: Bytes = pad(ab_carry.bytes, BIGINT_BYTE_SIZE + 1)
        ab_carry_carry = btoi(ab_carry_bytes[0])

        result = concat(ab_carry_bytes[1:], result)
        carry = ab_carry_carry + sum_carry

    if carry == 0:
        return result

    carry_bytes: Bytes = itob(carry)[7]
    return concat(carry_bytes, result)


@subroutine
def subtract(a: Bytes, b: Bytes) -> Bytes:
    # Assume a_in >= b_in
    # 0 - 0 case
    if a.length == 0 or a == bzero(b.length):
        return a
    # a - 0 case
    if b.length == 0 or b == bzero(b.length):
        return a
    BIGINT_BYTE_SIZE: UInt64 = UInt64(BIGINT_BYTE_SIZE_INT)
    length: UInt64 = enclosing_multiple(max_value(a.length, b.length), BIGINT_BYTE_SIZE)
    a_digits: Bytes = pad(a, length)
    b_digits: Bytes = pad(b, length)
    ones_complement: Bytes = ~b_digits
    twos_complement: Bytes = add(ones_complement, itob(1))
    a_inv_b: Bytes = add(a_digits, twos_complement)
    return a_inv_b[1:]


@subroutine
def equal(a: Bytes, b: Bytes) -> bool:
    length: UInt64 = max_value(a.length, b.length)
    padded_a: Bytes = pad(a, length)
    padded_b: Bytes = pad(b, length)
    return padded_a == padded_b


# Karatsuba algorithm by Anatoly Karatsuba
@subroutine
def multiply(x_in: Bytes, y_in: Bytes) -> Bytes:
    BIGINT_BYTE_SIZE: UInt64 = UInt64(BIGINT_BYTE_SIZE_INT)
    length: UInt64 = enclosing_multiple(
        max_value(x_in.length, y_in.length), BIGINT_BYTE_SIZE
    )
    x: Bytes = pad(x_in, length)
    y: Bytes = pad(y_in, length)

    n: UInt64 = x.length
    if n <= BIGINT_BYTE_SIZE:
        x_as_bigint: BigUInt = BigUInt.from_bytes(x)
        y_as_bigint: BigUInt = BigUInt.from_bytes(y)
        xy: BigUInt = x_as_bigint * y_as_bigint
        return xy.bytes

    first_half: UInt64 = n // 2
    second_half: UInt64 = n - first_half

    x_left: Bytes = x[:first_half]
    x_right: Bytes = x[first_half:]
    y_left: Bytes = y[:first_half]
    y_right: Bytes = y[first_half:]

    p_1: Bytes = multiply(x_left, y_left)
    p_2: Bytes = multiply(x_right, y_right)
    p_3: Bytes = multiply(add(x_left, x_right), add(y_left, y_right))
    p_4: Bytes = subtract(subtract(p_3, p_1), p_2)
    shifted_P1: Bytes = concat(p_1, bzero(2 * second_half))
    shifted_P4: Bytes = concat(p_4, bzero(second_half))
    return add(add(shifted_P1, shifted_P4), p_2)


@subroutine
def _bytes_to_uint256_digits(num: Bytes) -> arc4.DynamicArray[UInt256]:
    UINT256_BYTE_SIZE: UInt64 = UInt64(UINT256_BYTE_SIZE_INT)
    digits: arc4.DynamicArray[UInt256] = arc4.DynamicArray[UInt256]()
    zero: UInt256 = UInt256.from_bytes(bzero(UINT256_BYTE_SIZE))
    digits.append(zero)
    padded: Bytes = pad_as_multiple(num, UINT256_BYTE_SIZE)
    num_digits: UInt64 = padded.length // UINT256_BYTE_SIZE
    for i in urange(num_digits):
        digit_bytes: Bytes = extract(padded, i * UINT256_BYTE_SIZE, UINT256_BYTE_SIZE)
        digit: UInt256 = UInt256.from_bytes(digit_bytes)
        digits.append(digit)
    return digits


@subroutine
def _uint256_digits_to_bytes(digits: arc4.DynamicArray[UInt256]) -> Bytes:
    return decode_dynamic_bytes(digits.bytes)


@subroutine
def biguint_to_digit(num: BigUInt) -> UInt256:
    UINT256_BYTE_SIZE: UInt64 = UInt64(UINT256_BYTE_SIZE_INT)
    if num.bytes.length == 0:
        return UInt256.from_bytes(bzero(UINT256_BYTE_SIZE))

    padded: Bytes = pad_as_multiple(num.bytes, UINT256_BYTE_SIZE)
    exact_bytes: Bytes = substring(
        padded, padded.length - UINT256_BYTE_SIZE, padded.length
    )
    digit: UInt256 = UInt256.from_bytes(exact_bytes)
    return digit


@subroutine
def _multiply_word(
    digits: arc4.DynamicArray[UInt256], n: UInt64, d: BigUInt, base: BigUInt
) -> arc4.DynamicArray[UInt256]:
    c: BigUInt = BigUInt(0)
    for i in reversed(urange(1, n + 1)):
        digit: BigUInt = BigUInt.from_bytes(digits[i].bytes)
        p: BigUInt = d * digit + c
        p_mod_base: BigUInt = p % base
        normalized_digit: UInt256 = biguint_to_digit(p_mod_base)
        digits[i] = normalized_digit
        c = p // base
    digits[0] = biguint_to_digit(c)
    return digits


@subroutine
def _divide_word(
    u_raw: arc4.DynamicArray[UInt256], v_digit: BigUInt, base: BigUInt
) -> Bytes:
    r: BigUInt = BigUInt(0)
    for i in urange(u_raw.length):
        digit: BigUInt = BigUInt.from_bytes(u_raw[i].bytes)
        p: BigUInt = digit + r * base
        q_digit: BigUInt = p // v_digit
        u_raw[i] = biguint_to_digit(q_digit)
        r = p - q_digit * v_digit
    q: Bytes = _uint256_digits_to_bytes(u_raw)
    return q


@subroutine
def less_than(a: Bytes, b: Bytes) -> bool:
    BIGINT_BYTE_SIZE: UInt64 = UInt64(BIGINT_BYTE_SIZE_INT)
    length: UInt64 = enclosing_multiple(max_value(a.length, b.length), BIGINT_BYTE_SIZE)
    a_digits: Bytes = pad(a, length)
    b_digits: Bytes = pad(b, length)

    assert a_digits.length % BIGINT_BYTE_SIZE == 0, "a length must be multiple of width"
    assert b_digits.length % BIGINT_BYTE_SIZE == 0, "b length must be multiple of width"

    n: UInt64 = a_digits.length // BIGINT_BYTE_SIZE
    for i in urange(n):
        a_digit: BigUInt = BigUInt.from_bytes(
            extract(a_digits, i * BIGINT_BYTE_SIZE, BIGINT_BYTE_SIZE)
        )
        b_digit: BigUInt = BigUInt.from_bytes(
            extract(b_digits, i * BIGINT_BYTE_SIZE, BIGINT_BYTE_SIZE)
        )
        if a_digit < b_digit:
            return True
        if a_digit > b_digit:
            return False
    return False


@subroutine
def greater_than(a: Bytes, b: Bytes) -> bool:
    BIGINT_BYTE_SIZE: UInt64 = UInt64(BIGINT_BYTE_SIZE_INT)
    length: UInt64 = enclosing_multiple(max_value(a.length, b.length), BIGINT_BYTE_SIZE)
    a_digits: Bytes = pad(a, length)
    b_digits: Bytes = pad(b, length)

    assert a_digits.length % BIGINT_BYTE_SIZE == 0, "a length must be multiple of width"
    assert b_digits.length % BIGINT_BYTE_SIZE == 0, "b length must be multiple of width"

    n: UInt64 = a_digits.length // BIGINT_BYTE_SIZE
    for i in urange(n):
        a_digit: BigUInt = BigUInt.from_bytes(
            extract(a_digits, i * BIGINT_BYTE_SIZE, BIGINT_BYTE_SIZE)
        )
        b_digit: BigUInt = BigUInt.from_bytes(
            extract(b_digits, i * BIGINT_BYTE_SIZE, BIGINT_BYTE_SIZE)
        )
        if a_digit > b_digit:
            return True
        if a_digit < b_digit:
            return False
    return False


# Algorithm D by Robert Knuth
@subroutine
def divide(u_num: Bytes, v_num: Bytes) -> Bytes:
    assert u_num.length >= 1, "u_num must have at least one byte"
    assert v_num.length >= 1, "v_num must have at least one byte"
    assert not equal(v_num, itob(0)), "Non-zero divisor"

    BASE_UINT256: BigUInt = BigUInt(BASE_UINT256_INT)

    if less_than(u_num, v_num):
        # The divisor is larger than the dividend
        return itob(0)
    if equal(u_num, itob(0)):
        return itob(0)

    u_raw: arc4.DynamicArray[UInt256] = _bytes_to_uint256_digits(u_num)
    v_raw: arc4.DynamicArray[UInt256] = _bytes_to_uint256_digits(v_num)

    n: UInt64 = v_raw.length - 1

    assert n >= 1, "At least 1 digit divisor"

    m: UInt64 = u_raw.length - v_raw.length
    q: arc4.DynamicArray[UInt256] = arc4.DynamicArray[UInt256]()

    v_raw_1: BigUInt = BigUInt.from_bytes(v_raw[1].bytes)
    if n == 1:
        return _divide_word(u_raw, v_raw_1, BASE_UINT256)

    # Step D2: Normalize
    norm: BigUInt = BASE_UINT256 // (v_raw_1 + 1)
    u: arc4.DynamicArray[UInt256] = _multiply_word(u_raw, m + n, norm, BASE_UINT256)
    v: arc4.DynamicArray[UInt256] = _multiply_word(v_raw, n, norm, BASE_UINT256)
    v_1: BigUInt = BigUInt.from_bytes(v[1].bytes)
    # Step D3: Loop on j
    v_2: BigUInt = BigUInt.from_bytes(v[2].bytes)

    for j in urange(m + 1):
        # Step D3: Calculate estimated q
        u_j: BigUInt = BigUInt.from_bytes(u[j].bytes)
        u_j1: BigUInt = BigUInt.from_bytes(u[j + 1].bytes)

        qpart: BigUInt = BASE_UINT256 * u_j + u_j1
        qhat: BigUInt = qpart // v_1
        if u_j >= v_1:
            qhat = BASE_UINT256 - 1

        # Correct quotient estimate if too large
        u_j2: BigUInt = BigUInt.from_bytes(u[j + 2].bytes)
        qhat_test: BigUInt = qhat * v_1 + ((qhat * v_2) // BASE_UINT256)
        qhat_cond: BigUInt = qpart + (u_j2 // BASE_UINT256)
        while qhat_test > qhat_cond:
            qhat -= 1
            qhat_test = qhat * v_1 + ((qhat * v_2) // BASE_UINT256)

        # Step D4: Multiply and subtract
        c: BigUInt = BigUInt(0)
        c_is_neg: bool = False
        for i in reversed(urange(1, n + 1)):
            u_ji: BigUInt = BigUInt.from_bytes(u[j + i].bytes)
            v_i: BigUInt = BigUInt.from_bytes(v[i].bytes)
            p: BigUInt = BigUInt(0)
            p_mod_base: BigUInt = BigUInt(0)
            floor_div_adjuster: UInt64 = UInt64(0)
            if c_is_neg:
                # Handle case when c is negative
                if u_ji >= qhat * v_i + c:
                    # p is positive
                    p = u_ji - (qhat * v_i + c)
                    p_mod_base = p % BASE_UINT256
                    u[j + i] = biguint_to_digit(p_mod_base)
                    c = p // BASE_UINT256
                    c_is_neg = False
                else:
                    # p is negative
                    p = (qhat * v_i + c) - u_ji
                    p_mod_base = (BASE_UINT256 - (p % BASE_UINT256)) % BASE_UINT256
                    u[j + i] = biguint_to_digit(p_mod_base)
                    floor_div_adjuster = UInt64(1) if p_mod_base != 0 else UInt64(0)
                    c = (p // BASE_UINT256) + floor_div_adjuster
                    c_is_neg = True
            else:
                # Handle case when c is positive
                if u_ji + c >= qhat * v_i:
                    # p is positive
                    p = (u_ji + c) - qhat * v_i
                    p_mod_base = p % BASE_UINT256
                    u[j + i] = biguint_to_digit(p_mod_base)
                    c = p // BASE_UINT256
                    c_is_neg = False
                else:
                    # p is negative
                    p = (qhat * v_i) - (u_ji + c)
                    p_mod_base = (BASE_UINT256 - (p % BASE_UINT256)) % BASE_UINT256
                    u[j + i] = biguint_to_digit(p_mod_base)
                    floor_div_adjuster = UInt64(1) if p_mod_base != 0 else UInt64(0)
                    c = (p // BASE_UINT256) + floor_div_adjuster
                    c_is_neg = True

        # Step D5: Test remainder
        if c > u_j and c_is_neg:
            # Step D6: Add back
            qhat -= 1

        qhat_digit: UInt256 = biguint_to_digit(qhat)
        q.append(qhat_digit)

    return _uint256_digits_to_bytes(q)


@subroutine
def _calc_mod_barrett_reduce(a: Bytes, mod: Bytes, precomputed_factor: Bytes) -> Bytes:
    shift: UInt64 = mod.length * 2
    a_factor: Bytes = multiply(a, precomputed_factor)
    q: Bytes = extract(a_factor, 0, a_factor.length - shift)
    r: Bytes = subtract(a, multiply(q, mod))
    if not less_than(r, mod):
        r = subtract(r, mod)
    return extract(r, r.length - mod.length, mod.length)


@subroutine
def barrett_reducer_factor(mod: Bytes) -> Bytes:
    assert not equal(mod, itob(0)), "Must have mod != 0"
    assert not equal(
        mod & subtract(mod, itob(1)), itob(0)
    ), "mod cannot be a power of 2"

    shift: UInt64 = mod.length * 2
    one_byte: Bytes = extract(itob(1), 7, 1)
    two_k: Bytes = concat(one_byte, bzero(shift))
    return divide(two_k, mod)


# Barrett Reduction algorithm by P.D. Barrett
@subroutine
def mod_barrett_reduce(a: Bytes, mod: Bytes, precomputed_factor: Bytes) -> Bytes:
    # Assume: 0 <= a < mod ** 2, mod > 0, and mod is not a power of two
    mod_squared: Bytes = multiply(mod, mod)
    assert less_than(a, mod_squared), "Must have 0 <= a < mod ** 2"
    assert not equal(mod, itob(0)), "Must have mod != 0"
    assert not equal(
        mod & subtract(mod, itob(1)), itob(0)
    ), "mod cannot be a power of 2"

    return _calc_mod_barrett_reduce(a, mod, precomputed_factor)


# Modular Exponentiation by Squaring
@subroutine
def modexp_barrett_reduce(
    base: Bytes, exp: Bytes, mod: Bytes, precomputed_factor: Bytes
) -> Bytes:
    modexp_barrett_reduce_assumption_validation(base, mod)
    return modexp_barrett_reduce_post_validation(base, exp, mod, precomputed_factor)


@subroutine
def modexp_barrett_reduce_assumption_validation(base: Bytes, mod: Bytes) -> None:
    # Validate Barrett Reduction assumptions. Validating here validates all successive mod assumptions.
    mod_squared: Bytes = multiply(mod, mod)
    assert less_than(base, mod_squared), "Must have 0 <= a < mod ** 2"
    assert not equal(mod, itob(0)), "Must have mod != 0"
    assert not equal(
        mod & subtract(mod, itob(1)), itob(0)
    ), "mod cannot be a power of 2"


# Modular Exponentiation by Squaring
@subroutine
def modexp_barrett_reduce_post_validation(
    base: Bytes, exp: Bytes, mod: Bytes, precomputed_factor: Bytes
) -> Bytes:
    result: Bytes = itob(1)
    base = _calc_mod_barrett_reduce(base, mod, precomputed_factor)
    for bit_i in reversed(urange(exp.length * 8)):
        bit: UInt64 = getbit(exp, bit_i)
        if bit == 1:
            result = _calc_mod_barrett_reduce(
                multiply(result, base), mod, precomputed_factor
            )
        base = _calc_mod_barrett_reduce(multiply(base, base), mod, precomputed_factor)
    return result
