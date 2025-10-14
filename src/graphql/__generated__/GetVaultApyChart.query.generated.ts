import * as Types from "@morpho-org/blue-api-sdk";

import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;
export type GetVaultApyChartQueryVariables = Types.Exact<{
  address: Types.Scalars["String"]["input"];
  chainId: Types.Scalars["Int"]["input"];
  startTimestamp?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  endTimestamp?: Types.InputMaybe<Types.Scalars["Int"]["input"]>;
  interval: Types.TimeseriesInterval;
}>;

export type GetVaultApyChartQuery = {
  __typename?: "Query";
  vaultByAddress: {
    __typename?: "Vault";
    address: Types.Scalars["Address"]["output"];
    historicalState: {
      __typename?: "VaultHistory";
      apy: Array<{
        __typename?: "FloatDataPoint";
        x: number;
        y: number | null;
      }> | null;
      netApy: Array<{
        __typename?: "FloatDataPoint";
        x: number;
        y: number | null;
      }> | null;
    };
  };
};

export const GetVaultApyChartDocument = gql`
  query GetVaultApyChart(
    $address: String!
    $chainId: Int!
    $startTimestamp: Int
    $endTimestamp: Int
    $interval: TimeseriesInterval!
  ) {
    vaultByAddress(address: $address, chainId: $chainId) {
      address
      historicalState {
        apy(
          options: {
            startTimestamp: $startTimestamp
            endTimestamp: $endTimestamp
            interval: $interval
          }
        ) {
          x
          y
        }
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
 * __useGetVaultApyChartQuery__
 *
 * To run a query within a React component, call `useGetVaultApyChartQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetVaultApyChartQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetVaultApyChartQuery({
 *   variables: {
 *      address: // value for 'address'
 *      chainId: // value for 'chainId'
 *      startTimestamp: // value for 'startTimestamp'
 *      endTimestamp: // value for 'endTimestamp'
 *      interval: // value for 'interval'
 *   },
 * });
 */
export function useGetVaultApyChartQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetVaultApyChartQuery,
    GetVaultApyChartQueryVariables
  > &
    (
      | { variables: GetVaultApyChartQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetVaultApyChartQuery, GetVaultApyChartQueryVariables>(
    GetVaultApyChartDocument,
    options,
  );
}
export function useGetVaultApyChartLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetVaultApyChartQuery,
    GetVaultApyChartQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetVaultApyChartQuery,
    GetVaultApyChartQueryVariables
  >(GetVaultApyChartDocument, options);
}
export function useGetVaultApyChartSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetVaultApyChartQuery,
        GetVaultApyChartQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetVaultApyChartQuery,
    GetVaultApyChartQueryVariables
  >(GetVaultApyChartDocument, options);
}
export type GetVaultApyChartQueryHookResult = ReturnType<
  typeof useGetVaultApyChartQuery
>;
export type GetVaultApyChartLazyQueryHookResult = ReturnType<
  typeof useGetVaultApyChartLazyQuery
>;
export type GetVaultApyChartSuspenseQueryHookResult = ReturnType<
  typeof useGetVaultApyChartSuspenseQuery
>;
export type GetVaultApyChartQueryResult = Apollo.QueryResult<
  GetVaultApyChartQuery,
  GetVaultApyChartQueryVariables
>;

type BigIntFieldMap = {
  [key: string]: boolean | BigIntFieldMap;
};
export const getVaultApyChartBigIntFieldMap: BigIntFieldMap = {};
