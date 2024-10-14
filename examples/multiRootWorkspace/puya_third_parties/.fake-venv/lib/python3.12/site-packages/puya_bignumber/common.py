from algopy import Bytes, subroutine, UInt64
from algopy.op import substring, bzero, concat


@subroutine
def decode_dynamic_bytes(value: Bytes) -> Bytes:
    return substring(value, 2, value.length)


@subroutine
def pad(value: Bytes, width: UInt64) -> Bytes:
    assert value.length <= width, "Width must be wider than value"
    pad_length: UInt64 = width - value.length
    padding: Bytes = bzero(pad_length)
    padded: Bytes = concat(padding, value)
    return padded


@subroutine
def enclosing_multiple(num: UInt64, multiple: UInt64) -> UInt64:
    missing_length: UInt64 = multiple - num % multiple
    missing_length_mod: UInt64 = missing_length % multiple
    return num + missing_length_mod


@subroutine
def pad_as_multiple(value: Bytes, multiple: UInt64) -> Bytes:
    return pad(value, enclosing_multiple(value.length, multiple))


@subroutine
def min_value(a: UInt64, b: UInt64) -> UInt64:
    if a <= b:
        return a
    return b


@subroutine
def max_value(a: UInt64, b: UInt64) -> UInt64:
    if a >= b:
        return a
    return b
