from algopy import ARC4Contract, String, arc4, op
from algopy.arc4 import abimethod


class ListingKey(arc4.Struct, kw_only=True):
    owner: arc4.Address
    asset: arc4.UInt64
    nonce: arc4.UInt64


class HelloWorld(ARC4Contract):
    @abimethod(create="require")
    def initialize(self) -> None:
        op.err()

    @abimethod()
    def hello(self, name: String) -> String:
        return "Hello, " + name

