/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/kova_game.json`.
 */
export type KovaGame = {
  "address": "AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj",
  "metadata": {
    "name": "kovaGame",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Bounded KOVA game escrow and deterministic settlement program"
  },
  "instructions": [
    {
      "name": "activateTable",
      "discriminator": [
        195,
        246,
        221,
        102,
        126,
        193,
        250,
        110
      ],
      "accounts": [
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "table",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "startDigest",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "rosterHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "claimPayout",
      "discriminator": [
        127,
        240,
        132,
        62,
        227,
        198,
        146,
        133
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "table",
          "writable": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "entry",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "table"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "table"
          ]
        },
        {
          "name": "playerTokens",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "relations": [
            "table"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "claimRefund",
      "discriminator": [
        15,
        16,
        30,
        161,
        255,
        228,
        97,
        60
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "table",
          "writable": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "entry",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "table"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "table"
          ]
        },
        {
          "name": "playerTokens",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "relations": [
            "table"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "finalizeResult",
      "discriminator": [
        217,
        193,
        113,
        98,
        13,
        191,
        186,
        78
      ],
      "accounts": [
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "table",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initializeTable",
      "discriminator": [
        223,
        143,
        246,
        102,
        122,
        200,
        108,
        147
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "tableId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "table"
              }
            ]
          }
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tableId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "stakeRaw",
          "type": "u64"
        },
        {
          "name": "maxPlayers",
          "type": "u8"
        },
        {
          "name": "openForSeconds",
          "type": "u16"
        },
        {
          "name": "roundSeconds",
          "type": "u16"
        },
        {
          "name": "oracle",
          "type": "pubkey"
        },
        {
          "name": "admissionAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "joinTable",
      "discriminator": [
        14,
        117,
        84,
        51,
        95,
        146,
        171,
        70
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "admissionAuthority",
          "signer": true
        },
        {
          "name": "table",
          "writable": true
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "table"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "table"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "table"
          ]
        },
        {
          "name": "playerTokens",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "relations": [
            "table"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "sealedMarketHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "lockTable",
      "discriminator": [
        114,
        110,
        3,
        79,
        117,
        255,
        135,
        75
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "table"
          ]
        },
        {
          "name": "table",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "recordResult",
      "discriminator": [
        208,
        243,
        63,
        218,
        63,
        116,
        76,
        80
      ],
      "accounts": [
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "table",
          "writable": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "entry",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "endPrice18",
          "type": "u128"
        }
      ]
    },
    {
      "name": "recordStart",
      "discriminator": [
        201,
        188,
        38,
        46,
        253,
        100,
        76,
        138
      ],
      "accounts": [
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "table",
          "writable": true,
          "relations": [
            "entry"
          ]
        },
        {
          "name": "entry",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "startPrice18",
          "type": "u128"
        },
        {
          "name": "evidenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "voidExpiredTable",
      "discriminator": [
        115,
        80,
        156,
        8,
        214,
        173,
        102,
        224
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "entry",
      "discriminator": [
        63,
        18,
        152,
        113,
        215,
        246,
        221,
        250
      ]
    },
    {
      "name": "table",
      "discriminator": [
        34,
        100,
        138,
        97,
        236,
        129,
        230,
        112
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unsupportedTokenProgram",
      "msg": "Only Token-2022 stake mints are supported."
    },
    {
      "code": 6001,
      "name": "invalidStakeMint",
      "msg": "The stake mint must use the configured six decimal places."
    },
    {
      "code": 6002,
      "name": "mutableStakeMint",
      "msg": "The stake mint must have no mint or freeze authority."
    },
    {
      "code": 6003,
      "name": "unsupportedStakeMintExtension",
      "msg": "The stake mint contains an unsupported Token-2022 extension."
    },
    {
      "code": 6004,
      "name": "invalidPlayerCount",
      "msg": "Player count is outside the supported range."
    },
    {
      "code": 6005,
      "name": "invalidStake",
      "msg": "Stake is outside the supported range."
    },
    {
      "code": 6006,
      "name": "invalidOpenWindow",
      "msg": "Open window is outside the supported range."
    },
    {
      "code": 6007,
      "name": "invalidRoundWindow",
      "msg": "Round window is outside the supported range."
    },
    {
      "code": 6008,
      "name": "invalidAuthority",
      "msg": "Authority is invalid."
    },
    {
      "code": 6009,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow."
    },
    {
      "code": 6010,
      "name": "tableNotOpen",
      "msg": "Table is not open."
    },
    {
      "code": 6011,
      "name": "openWindowExpired",
      "msg": "Open window expired."
    },
    {
      "code": 6012,
      "name": "tableFull",
      "msg": "Table is full."
    },
    {
      "code": 6013,
      "name": "invalidAdmissionAuthority",
      "msg": "Admission authority does not match the table."
    },
    {
      "code": 6014,
      "name": "invalidCommitment",
      "msg": "Commitment is invalid."
    },
    {
      "code": 6015,
      "name": "insufficientPlayers",
      "msg": "At least two funded players are required."
    },
    {
      "code": 6016,
      "name": "tableNotLocking",
      "msg": "Table is not locking."
    },
    {
      "code": 6017,
      "name": "invalidOracle",
      "msg": "Oracle does not match the table."
    },
    {
      "code": 6018,
      "name": "invalidPrice",
      "msg": "Price is invalid."
    },
    {
      "code": 6019,
      "name": "invalidEvidence",
      "msg": "Evidence hash is invalid."
    },
    {
      "code": 6020,
      "name": "startAlreadyRecorded",
      "msg": "Start was already recorded."
    },
    {
      "code": 6021,
      "name": "activationWindowExpired",
      "msg": "Activation window expired."
    },
    {
      "code": 6022,
      "name": "incompleteStarts",
      "msg": "Not every funded entry has a start mark."
    },
    {
      "code": 6023,
      "name": "tableNotActive",
      "msg": "Table is not active."
    },
    {
      "code": 6024,
      "name": "roundStillActive",
      "msg": "Round is still active."
    },
    {
      "code": 6025,
      "name": "settlementDeadlineReached",
      "msg": "Settlement deadline was reached."
    },
    {
      "code": 6026,
      "name": "resultAlreadyRecorded",
      "msg": "Result was already recorded."
    },
    {
      "code": 6027,
      "name": "tableNotSettling",
      "msg": "Table is not settling."
    },
    {
      "code": 6028,
      "name": "incompleteResults",
      "msg": "Not every funded entry has a result."
    },
    {
      "code": 6029,
      "name": "invalidEntrySet",
      "msg": "Entry set is incomplete or invalid."
    },
    {
      "code": 6030,
      "name": "entriesNotSorted",
      "msg": "Entries must be ordered by decoded wallet bytes."
    },
    {
      "code": 6031,
      "name": "startDigestMismatch",
      "msg": "Start digest does not match the activated digest."
    },
    {
      "code": 6032,
      "name": "rosterHashMismatch",
      "msg": "Roster hash does not match the funded entry set."
    },
    {
      "code": 6033,
      "name": "potNotConserved",
      "msg": "Pot is not conserved."
    },
    {
      "code": 6034,
      "name": "timeoutNotDue",
      "msg": "No timeout is currently due."
    },
    {
      "code": 6035,
      "name": "resultNotFinal",
      "msg": "Result is not final."
    },
    {
      "code": 6036,
      "name": "alreadyClaimed",
      "msg": "This entry was already paid or refunded."
    },
    {
      "code": 6037,
      "name": "refundNotAvailable",
      "msg": "Refund is not available."
    },
    {
      "code": 6038,
      "name": "priceOutOfRange",
      "msg": "Price exceeds the signed scoring range."
    },
    {
      "code": 6039,
      "name": "scoreOutOfRange",
      "msg": "Score exceeds the signed output range."
    }
  ],
  "types": [
    {
      "name": "entry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "table",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sealedMarketHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "funded",
            "type": "bool"
          },
          {
            "name": "startRecorded",
            "type": "bool"
          },
          {
            "name": "resultRecorded",
            "type": "bool"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "refunded",
            "type": "bool"
          },
          {
            "name": "startPrice18",
            "type": "u128"
          },
          {
            "name": "endPrice18",
            "type": "u128"
          },
          {
            "name": "scoreBps",
            "type": "i64"
          },
          {
            "name": "awardRaw",
            "type": "u64"
          },
          {
            "name": "startLeaf",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "table",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "admissionAuthority",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "tokenProgram",
            "type": "pubkey"
          },
          {
            "name": "tableId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "stakeRaw",
            "type": "u64"
          },
          {
            "name": "maxPlayers",
            "type": "u8"
          },
          {
            "name": "fundedPlayers",
            "type": "u8"
          },
          {
            "name": "startRecords",
            "type": "u8"
          },
          {
            "name": "resultRecords",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "tableStatus"
              }
            }
          },
          {
            "name": "openUntil",
            "type": "i64"
          },
          {
            "name": "activationDeadline",
            "type": "i64"
          },
          {
            "name": "plannedStart",
            "type": "i64"
          },
          {
            "name": "startsAt",
            "type": "i64"
          },
          {
            "name": "endsAt",
            "type": "i64"
          },
          {
            "name": "settlementDeadline",
            "type": "i64"
          },
          {
            "name": "roundSeconds",
            "type": "u16"
          },
          {
            "name": "startDigest",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "rosterHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "winnerCount",
            "type": "u8"
          },
          {
            "name": "potRaw",
            "type": "u64"
          },
          {
            "name": "totalAwards",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tableStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "open"
          },
          {
            "name": "locking"
          },
          {
            "name": "active"
          },
          {
            "name": "settling"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "voided"
          }
        ]
      }
    }
  ]
};

