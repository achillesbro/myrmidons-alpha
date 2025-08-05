import * as Types from "@morpho-org/blue-api-sdk";

import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;
export type GetVaultApyHistoryQueryVariables = Types.Exact<{
  address: Types.Scalars["String"]["input"];
  chainId: Types.Scalars["Int"]["input"];
  startTimestamp?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  endTimestamp?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  interval: Types.TimeseriesInterval;
}>;

export type GetVaultApyHistoryQuery = {
  __typename?: "Query";
  vaultByAddress: {
    __typename?: "Vault";
    historicalState: {
      __typename?: "VaultHistory";
      netApy: Array<{
        __typename?: "FloatDataPoint";
        x: number;
        y: number | null;
      }> | null;
    };
  };
};

export const GetVaultApyHistoryDocument = gql`
  query GetVaultApyHistory(
    $address: String!
    $chainId: Int!
    $startTimestamp: Int
    $endTimestamp: Int
    $interval: TimeseriesInterval!
  ) {
    vaultByAddress(address: $address, chainId: $chainId) {
      historicalState {
        netApy(
          options: {
            startTimestamp: $startTimestamp
            endTimestamp: $endTimestamp
            interval: $interval
          }
        ) {
          x
          y
        }
      }
    }
  }
`;

/**
 * __useGetVaultApyHistoryQuery__
 *
 * To run a query within a React component, call `useGetVaultApyHistoryQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetVaultApyHistoryQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetVaultApyHistoryQuery({
 *   variables: {
 *      address: // value for 'address'
 *      chainId: // value for 'chainId'
 *      startTimestamp: // value for 'startTimestamp'
 *      endTimestamp: // value for 'endTimestamp'
 *      interval: // value for 'interval'
 *   },
 * });
 */
export function useGetVaultApyHistoryQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetVaultApyHistoryQuery,
    GetVaultApyHistoryQueryVariables
  > &
    (
      | { variables: GetVaultApyHistoryQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetVaultApyHistoryQuery,
    GetVaultApyHistoryQueryVariables
  >(GetVaultApyHistoryDocument, options);
}
export function useGetVaultApyHistoryLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetVaultApyHistoryQuery,
    GetVaultApyHistoryQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetVaultApyHistoryQuery,
    GetVaultApyHistoryQueryVariables
  >(GetVaultApyHistoryDocument, options);
}
export function useGetVaultApyHistorySuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetVaultApyHistoryQuery,
        GetVaultApyHistoryQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetVaultApyHistoryQuery,
    GetVaultApyHistoryQueryVariables
  >(GetVaultApyHistoryDocument, options);
}
export type GetVaultApyHistoryQueryHookResult = ReturnType<
  typeof useGetVaultApyHistoryQuery
>;
export type GetVaultApyHistoryLazyQueryHookResult = ReturnType<
  typeof useGetVaultApyHistoryLazyQuery
>;
export type GetVaultApyHistorySuspenseQueryHookResult = ReturnType<
  typeof useGetVaultApyHistorySuspenseQuery
>;
export type GetVaultApyHistoryQueryResult = Apollo.QueryResult<
  GetVaultApyHistoryQuery,
  GetVaultApyHistoryQueryVariables
>;

type BigIntFieldMap = {
  [key: string]: boolean | BigIntFieldMap;
};
export const getVaultApyHistoryBigIntFieldMap: BigIntFieldMap = {};
