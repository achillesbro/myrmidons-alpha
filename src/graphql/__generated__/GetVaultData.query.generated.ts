import * as Types from "@morpho-org/blue-api-sdk";

import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;
export type GetVaultDataQueryVariables = Types.Exact<{
  address: Types.Scalars["String"]["input"];
  chainId: Types.Scalars["Int"]["input"];
}>;

export type GetVaultDataQuery = {
  __typename?: "Query";
  vaultByAddress: {
    __typename?: "Vault";
    address: Types.Scalars["Address"]["output"];
    name: string;
    symbol: string;
    asset: {
      __typename?: "Asset";
      address: Types.Scalars["Address"]["output"];
      symbol: string;
      decimals: number;
      priceUsd: number | null;
    };
    state: {
      __typename?: "VaultState";
      apy: number;
      netApy: number | null;
      netApyWithoutRewards: number;
      dailyApy: number | null;
      dailyNetApy: number | null;
      weeklyApy: number | null;
      weeklyNetApy: number | null;
      monthlyApy: number | null;
      monthlyNetApy: number | null;
      totalAssets: Types.Scalars["BigInt"]["output"];
      totalAssetsUsd: number | null;
      totalSupply: Types.Scalars["BigInt"]["output"];
      sharePrice: Types.Scalars["BigInt"]["output"] | null;
      sharePriceUsd: number | null;
      allocation: Array<{
        __typename?: "VaultAllocation";
        supplyAssets: Types.Scalars["BigInt"]["output"];
        supplyAssetsUsd: number | null;
        market: {
          __typename?: "Market";
          uniqueKey: Types.Scalars["MarketId"]["output"];
          lltv: Types.Scalars["BigInt"]["output"];
          loanAsset: {
            __typename?: "Asset";
            name: string;
            symbol: string;
            address: Types.Scalars["Address"]["output"];
            decimals: number;
            priceUsd: number | null;
          };
          collateralAsset: {
            __typename?: "Asset";
            name: string;
            symbol: string;
            address: Types.Scalars["Address"]["output"];
            logoURI: string | null;
          } | null;
          state: { __typename?: "MarketState"; supplyApy: number } | null;
        };
      }> | null;
    } | null;
  };
};

export const GetVaultDataDocument = gql`
  query GetVaultData($address: String!, $chainId: Int!) {
    vaultByAddress(address: $address, chainId: $chainId) {
      address
      name
      symbol
      asset {
        address
        symbol
        decimals
        priceUsd
      }
      state {
        apy
        netApy
        netApyWithoutRewards
        dailyApy
        dailyNetApy
        weeklyApy
        weeklyNetApy
        monthlyApy
        monthlyNetApy
        totalAssets
        totalAssetsUsd
        totalSupply
        sharePrice
        sharePriceUsd
        allocation {
          supplyAssets
          supplyAssetsUsd
          market {
            uniqueKey
            loanAsset {
              name
              symbol
              address
              decimals
              priceUsd
            }
            collateralAsset {
              name
              symbol
              address
              logoURI
            }
            lltv
            state {
              supplyApy
            }
          }
        }
      }
    }
  }
`;

/**
 * __useGetVaultDataQuery__
 *
 * To run a query within a React component, call `useGetVaultDataQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetVaultDataQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetVaultDataQuery({
 *   variables: {
 *      address: // value for 'address'
 *      chainId: // value for 'chainId'
 *   },
 * });
 */
export function useGetVaultDataQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetVaultDataQuery,
    GetVaultDataQueryVariables
  > &
    (
      | { variables: GetVaultDataQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetVaultDataQuery, GetVaultDataQueryVariables>(
    GetVaultDataDocument,
    options,
  );
}
export function useGetVaultDataLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetVaultDataQuery,
    GetVaultDataQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetVaultDataQuery, GetVaultDataQueryVariables>(
    GetVaultDataDocument,
    options,
  );
}
export function useGetVaultDataSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetVaultDataQuery,
        GetVaultDataQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<GetVaultDataQuery, GetVaultDataQueryVariables>(
    GetVaultDataDocument,
    options,
  );
}
export type GetVaultDataQueryHookResult = ReturnType<
  typeof useGetVaultDataQuery
>;
export type GetVaultDataLazyQueryHookResult = ReturnType<
  typeof useGetVaultDataLazyQuery
>;
export type GetVaultDataSuspenseQueryHookResult = ReturnType<
  typeof useGetVaultDataSuspenseQuery
>;
export type GetVaultDataQueryResult = Apollo.QueryResult<
  GetVaultDataQuery,
  GetVaultDataQueryVariables
>;

type BigIntFieldMap = {
  [key: string]: boolean | BigIntFieldMap;
};
export const getVaultDataBigIntFieldMap: BigIntFieldMap = {
  vaultByAddress: {
    state: {
      totalAssets: true,
      totalSupply: true,
      sharePrice: true,
      allocation: {
        supplyAssets: true,
        market: {
          lltv: true,
        },
      },
    },
  },
};
