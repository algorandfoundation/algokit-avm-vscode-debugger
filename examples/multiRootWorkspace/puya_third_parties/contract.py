from algopy import Bytes, OpUpFeeSource, arc4, ensure_budget
from puya_rsa import pkcs1_v15_verify


class RSATester(arc4.ARC4Contract):
    @arc4.abimethod()
    def pkcs1_v15_verify(
        self,
        msg_digest_info: Bytes,
        s: Bytes,
        n: Bytes,
        e: Bytes,
        barrett_reduction_factor: Bytes,
    ) -> None:
        ensure_budget(20000, fee_source=OpUpFeeSource.GroupCredit)
        pkcs1_v15_verify(msg_digest_info, s, n, e, barrett_reduction_factor)
