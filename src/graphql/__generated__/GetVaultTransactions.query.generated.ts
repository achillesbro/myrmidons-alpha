import * as Types from "@morpho-org/blue-api-sdk";

import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;
export type GetVaultTransactionsQueryVariables = Types.Exact<{
  [key: string]: never;
}>;

export type GetVaultTransactionsQuery = {
  __typename?: "Query";
  transactions: {
    __typename?: "PaginatedTransactions";
    items: Array<{
      __typename?: "Transaction";
      blockNumber: Types.Scalars["BigInt"]["output"];
      hash: Types.Scalars["HexString"]["output"];
      type: Types.TransactionType;
      timestamp: Types.Scalars["BigInt"]["output"];
      user: {
        __typename?: "User";
        address: Types.Scalars["Address"]["output"];
      };
    }> | null;
  };
};

export const GetVaultTransactionsDocument = gql`
  query GetVaultTransactions {
    transactions(
      first: 10
      orderBy: Timestamp
      orderDirection: Desc
      where: { vaultAddress_in: ["0xDDD64e2EF73b0741BdB1e2813a1115FD150aef36"] }
    ) {
      items {
        blockNumber
        hash
        type
        user {
          address
        }
        timestamp
      }
    }
  }
`;

/**
 * __useGetVaultTransactionsQuery__
 *
 * To run a query within a React component, call `useGetVaultTransactionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetVaultTransactionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetVaultTransactionsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetVaultTransactionsQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetVaultTransactionsQuery,
    GetVaultTransactionsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetVaultTransactionsQuery,
    GetVaultTransactionsQueryVariables
  >(GetVaultTransactionsDocument, options);
}
export function useGetVaultTransactionsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetVaultTransactionsQuery,
    GetVaultTransactionsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetVaultTransactionsQuery,
    GetVaultTransactionsQueryVariables
  >(GetVaultTransactionsDocument, options);
}
export function useGetVaultTransactionsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetVaultTransactionsQuery,
        GetVaultTransactionsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetVaultTransactionsQuery,
    GetVaultTransactionsQueryVariables
  >(GetVaultTransactionsDocument, options);
}
export type GetVaultTransactionsQueryHookResult = ReturnType<
  typeof useGetVaultTransactionsQuery
>;
export type GetVaultTransactionsLazyQueryHookResult = ReturnType<
  typeof useGetVaultTransactionsLazyQuery
>;
export type GetVaultTransactionsSuspenseQueryHookResult = ReturnType<
  typeof useGetVaultTransactionsSuspenseQuery
>;
export type GetVaultTransactionsQueryResult = Apollo.QueryResult<
  GetVaultTransactionsQuery,
  GetVaultTransactionsQueryVariables
>;

type BigIntFieldMap = {
  [key: string]: boolean | BigIntFieldMap;
};
export const getVaultTransactionsBigIntFieldMap: BigIntFieldMap = {
  transactions: {
    items: {
      blockNumber: true,
      timestamp: true,
    },
  },
};
