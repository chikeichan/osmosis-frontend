import { observer } from "mobx-react-lite";
import type { NextPage } from "next";
// import { ProgressiveSvgImage } from "../components/progressive-svg-image";
import { TradeClipboard } from "../components/trade-clipboard";
import { useStore } from "../stores";
// import { IS_FRONTIER } from "../config";
import { BirthdayLettersSvg } from "../components/birthday-letters";
import { Dec } from "@keplr-wallet/unit";
import { useMemo, useRef } from "react";

const Home: NextPage = observer(function () {
  const { chainStore, queriesStore } = useStore();
  const { chainId } = chainStore.osmosis;

  const queries = queriesStore.get(chainId);
  const queryPools = queries.osmosis!.queryGammPools;

  // If pool has already passed once, it will be passed immediately without recalculation.
  const poolsPassed = useRef<Map<string, boolean>>(new Map());
  const allPools = queryPools.getAllPools();
  // Pools should be memoized before passing to trade in config
  const pools = useMemo(
    () =>
      allPools
        .filter((pool) => {
          // TODO: If not on production environment, this logic should pass all pools (or other selection standard).

          // Trim not useful pools.

          const passed = poolsPassed.current.get(pool.id);
          if (passed) {
            return true;
          }

          // There is currently no good way to pick a pool that is worthwhile.
          // For now, based on the mainnet, only those pools with assets above a certain value are calculated for swap.

          let hasEnoughAssets = false;

          for (const asset of pool.poolAssets) {
            // Probably, the pools that include gamm token may be created mistakenly by users.
            if (
              asset.amount.currency.coinMinimalDenom.startsWith("gamm/pool/")
            ) {
              return false;
            }

            // Only pools with at least 1000 osmo are dealt with.
            if (asset.amount.currency.coinMinimalDenom === "uosmo") {
              if (asset.amount.toDec().gt(new Dec(1000))) {
                hasEnoughAssets = true;
                break;
              }
            }

            // Only pools with at least 10 ion are dealt with.
            if (asset.amount.currency.coinMinimalDenom === "uion") {
              if (asset.amount.toDec().gt(new Dec(10))) {
                hasEnoughAssets = true;
                break;
              }
            }

            // Only pools with at least 1000 atom are dealt with.
            if (
              "originChainId" in asset.amount.currency &&
              asset.amount.currency.coinMinimalDenom ===
                "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2"
            ) {
              if (asset.amount.toDec().gt(new Dec(1000))) {
                hasEnoughAssets = true;
                break;
              }
            }
          }

          if (hasEnoughAssets) {
            console.log(`${pool.id} will be included to swap router`);
            poolsPassed.current.set(pool.id, true);
          }

          return hasEnoughAssets;
        })
        .map((pool) => pool.pool),
    [allPools]
  );

  return (
    <main className="relative bg-background h-screen">
      <div className="absolute w-full h-full bg-home-bg-pattern bg-repeat-x bg-cover">
        <svg
          className="absolute w-full h-full lg:hidden"
          viewBox="-100 50 1300 900"
          height="900"
          preserveAspectRatio={"xMidYMid slice"}
        >
          <BirthdayLettersSvg />
          <image
            x="80"
            y="240"
            width="600"
            height="600"
            href="wos-birthday.svg"
          />
          <image
            x="-130"
            y="370"
            width="600"
            height="600"
            href="amelia-birthday.svg"
          />
          <image
            x="100"
            y="500"
            width="500"
            height="500"
            href="cake-birthday.svg"
          />
          <image
            className="bounce"
            x="450"
            y="360"
            width="200"
            height="200"
            href="ion-birthday.svg"
          />
        </svg>
      </div>
      <div className="w-full h-full flex items-center overflow-x-hidden overflow-y-auto">
        <TradeClipboard
          containerClassName="w-[32.5rem] md:w-[29.9rem] md:mt-mobile-header ml-auto mr-[10%] lg:mx-auto"
          pools={pools}
        />
      </div>
    </main>
  );
});

export default Home;
