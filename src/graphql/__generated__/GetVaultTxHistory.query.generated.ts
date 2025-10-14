import * as Types from "@morpho-org/blue-api-sdk";

import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;
export type GetVaultTxHistoryQueryVariables = Types.Exact<{
  vaultAddress?: Types.InputMaybe<
    Array<Types.Scalars["String"]["input"]> | Types.Scalars["String"]["input"]
  >;
  first?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  orderBy?: Types.InputMaybe<Types.TransactionsOrderBy>;
  orderDirection?: Types.InputMaybe<Types.OrderDirection>;
}>;

export type GetVaultTxHistoryQuery = {
  __typename?: "Query";
  transactions: {
    __typename?: "PaginatedTransactions";
    items: Array<{
      __typename?: "Transaction";
      hash: Types.Scalars["HexString"]["output"];
      timestamp: Types.Scalars["BigInt"]["output"];
      type: Types.TransactionType;
      blockNumber: Types.Scalars["BigInt"]["output"];
      user: {
        __typename?: "User";
        address: Types.Scalars["Address"]["output"];
      };
      data:
        | { __typename?: "MarketCollateralTransferTransactionData" }
        | { __typename?: "MarketLiquidationTransactionData" }
        | { __typename?: "MarketTransferTransactionData" }
        | {
            __typename?: "VaultTransactionData";
            shares: Types.Scalars["BigInt"]["output"];
            assets: Types.Scalars["BigInt"]["output"];
            vault: {
              __typename?: "Vault";
              address: Types.Scalars["Address"]["output"];
            };
          };
    }> | null;
  };
};

export const GetVaultTxHistoryDocument = gql`
  query GetVaultTxHistory(
    $vaultAddress: [String!]
    $first: Int
    $orderBy: TransactionsOrderBy
    $orderDirection: OrderDirection
  ) {
    transactions(
      first: $first
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: { vaultAddress_in: $vaultAddress }
    ) {
      items {
        hash
        timestamp
        type
        blockNumber
        user {
          address
        }
        data {
          ... on VaultTransactionData {
            shares
            assets
            vault {
              address
            }
          }
        }
      }
    }
  }
`;

/**
 * __useGetVaultTxHistoryQuery__
 *
 * To run a query within a React component, call `useGetVaultTxHistoryQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetVaultTxHistoryQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetVaultTxHistoryQuery({
 *   variables: {
 *      vaultAddress: // value for 'vaultAddress'
 *      first: // value for 'first'
 *      orderBy: // value for 'orderBy'
 *      orderDirection: // value for 'orderDirection'
 *   },
 * });
 */
export function useGetVaultTxHistoryQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetVaultTxHistoryQuery,
    GetVaultTxHistoryQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetVaultTxHistoryQuery,
    GetVaultTxHistoryQueryVariables
  >(GetVaultTxHistoryDocument, options);
}
export function useGetVaultTxHistoryLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetVaultTxHistoryQuery,
    GetVaultTxHistoryQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetVaultTxHistoryQuery,
    GetVaultTxHistoryQueryVariables
  >(GetVaultTxHistoryDocument, options);
}
export function useGetVaultTxHistorySuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetVaultTxHistoryQuery,
        GetVaultTxHistoryQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetVaultTxHistoryQuery,
    GetVaultTxHistoryQueryVariables
  >(GetVaultTxHistoryDocument, options);
}
export type GetVaultTxHistoryQueryHookResult = ReturnType<
  typeof useGetVaultTxHistoryQuery
>;
export type GetVaultTxHistoryLazyQueryHookResult = ReturnType<
  typeof useGetVaultTxHistoryLazyQuery
>;
export type GetVaultTxHistorySuspenseQueryHookResult = ReturnType<
  typeof useGetVaultTxHistorySuspenseQuery
>;
export type GetVaultTxHistoryQueryResult = Apollo.QueryResult<
  GetVaultTxHistoryQuery,
  GetVaultTxHistoryQueryVariables
>;

type BigIntFieldMap = {
  [key: string]: boolean | BigIntFieldMap;
};
export const getVaultTxHistoryBigIntFieldMap: BigIntFieldMap = {
  transactions: {
    items: {
      timestamp: true,
      blockNumber: true,
      data: {
        shares: true,
        assets: true,
      },
    },
  },
};
