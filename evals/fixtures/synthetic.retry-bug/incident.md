# Retry incident

`deliverWithRetry` retries after an acknowledgement is lost. The first call may
have applied the effect before throwing, so blindly calling it again duplicates
the effect. Prove the uncertain-state cause and introduce idempotent handling.
