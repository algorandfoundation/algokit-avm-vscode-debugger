# pyright: reportMissingModuleSource=false
from algopy import gtxn, logicsig


@logicsig
def approve_hello_call() -> bool:
    app_txn = gtxn.ApplicationCallTransaction(0)
    assert app_txn.app_id == 1002
    return True
