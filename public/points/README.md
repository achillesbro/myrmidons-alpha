# Points Data Directory

This directory contains points data files used by the Accumulated Rewards section.

## Files

### `totals.json`
User points data from `vault-computation-cli`. This file should be updated periodically when you run snapshots.

**Format:**
```json
[
  {
    "chainId": "999",
    "vault": "0x8Ec77176F71F5ff53B71b01FC492F46Ea4e55A77",
    "wallet": "0xa1ddd3455a909b6c3efab5ddc0c2706895104a0e",
    "points": 797947.273135103
  }
]
```

**To update:** Copy the `totals.json` file from your `vault-computation-cli` output to this directory.

### `ecosystem-points.json`
Manual configuration for ecosystem points per protocol. Update this file when ecosystem points are distributed.

**Format:**
```json
[
  {
    "protocolKey": "hyperbeat",
    "protocolName": "Hyperbeat",
    "points": 100000,
    "tag": null
  },
  {
    "protocolKey": "hyperswap",
    "protocolName": "Hyperswap",
    "points": null,
    "tag": "AIRDROPPED"
  }
]
```

**Fields:**
- `protocolKey`: Must match the protocol key from Octav API (e.g., "hyperbeat", "hyperlend")
- `protocolName`: Display name for the protocol
- `points`: Total ecosystem points for this protocol (null if not yet distributed)
- `tag`: Optional tag (e.g., "AIRDROPPED")

**To update:** Edit this file manually when ecosystem points are distributed. The points will be distributed pro-rata to users based on their total points vs vault total points.

