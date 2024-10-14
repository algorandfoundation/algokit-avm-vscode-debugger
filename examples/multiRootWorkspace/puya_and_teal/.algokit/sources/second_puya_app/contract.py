# pyright: reportMissingModuleSource=false
from algopy import Application, ARC4Contract, Bytes, String, itxn
from algopy.arc4 import abimethod


class HelloWorld2(ARC4Contract):
    @abimethod()
    def hello(self, name: String, app_id: Application) -> String:
        response = itxn.ApplicationCall(
            app_id=app_id, app_args=(Bytes.from_hex("ee67fb50"), name.bytes), fee=0
        ).submit()

        return String.from_bytes(response.last_log)
