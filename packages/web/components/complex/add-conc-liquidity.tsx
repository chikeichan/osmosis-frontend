import {FunctionComponent, ReactNode, useMemo, useState} from "react";
import classNames from "classnames";
import { observer } from "mobx-react-lite";
import { PricePretty, CoinPretty } from "@keplr-wallet/unit";
import {
  ObservableAddLiquidityConfig,
  ObservablePoolDetail,
  ObservableQueryPool,
  ObservableSuperfluidPoolDetail
} from "@osmosis-labs/stores";
import { useStore } from "../../stores";
import {useWindowSize} from "../../hooks";
import { InputBox } from "../input";
import { CustomClasses } from "../types";
import { useTranslation } from "react-multi-lang";


import {
  AnimatedAxis, // any of these can be non-animated equivalents
  AnimatedGrid,
  AnimatedLineSeries,
  AnimatedBarSeries,
  XYChart,
  Tooltip,
  buildChartTheme,
  Annotation,
  AnnotationLineSubject,
  AnnotationConnector, AnnotationCircleSubject,
} from '@visx/xychart';

import {ParentSize} from "@visx/responsive";
import {curveNatural} from "@visx/curve";
import {theme} from "../../tailwind.config";
import {scaleLinear} from "@visx/scale";
import {debounce} from "debounce";
import {PoolAssetsIcon} from "../assets";
import Image from "next/image";
import {useRouter} from "next/router";
import {Button} from "../buttons";
import {coin} from "@cosmjs/launchpad";

enum AddConcLiquidityModalView {
  Overview,
  AddConcLiq,
  AddFullRange,
}

const data1 = makeData();

const accessors = {
  xAccessor: (d: any) => {
    return d?.time;
  },
  yAccessor: (d: any) => {
    return d?.price;
  },
};

function makeData(lastPrice = 1) {
  let lp = lastPrice;
  let date = Date.now();
  return Array(168)
    .fill(null)
    .map((_, i) => {
      const diffPer = !i ? 0 : (Math.random() - .5) / (.5 / .05);
      const newLp = lp + lp * diffPer;
      lp = newLp;
      return {
        time: date - i * 3600000,
        price: newLp,
      };
    })
    .reverse();
}

function getRangeFromData(data: number[]) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const last = data[data.length - 1];
  const diff = Math.max(
    Math.max(Math.abs(last - max), Math.abs(last - min)),
    last * 0.25,
  );

  return {
    min: Math.max(0, last - diff),
    max: last + diff,
    last,
  };
}

function getDepthFromRange(min: number, max: number) {
  const priceTick = (max - min) / 16;
  const val = [];
  for (let i = 0; i < 16; i++) {
    const depth = Math.floor(Math.random() * 1000);
    val.push({
      tick: min + priceTick * i,
      depth,
    });
  }
  return val;
}

const yRange = getRangeFromData(data1.map(accessors.yAccessor));
const depthData = getDepthFromRange(yRange.min, yRange.max);

export const AddConcLiquidity: FunctionComponent<
  {
    addLiquidityConfig: ObservableAddLiquidityConfig;
    actionButton: ReactNode;
    getFiatValue?: (coin: CoinPretty) => PricePretty | undefined;
  } & CustomClasses
> = observer(
  ({
     className,
     addLiquidityConfig,
     actionButton,
     getFiatValue,
  }) => {
    const router = useRouter();
    const { id: poolId } = router.query as { id: string };
    const [view, setView] = useState<AddConcLiquidityModalView>(AddConcLiquidityModalView.Overview);
    const { derivedDataStore } = useStore();

    // initialize pool data stores once root pool store is loaded
    const { poolDetail, superfluidPoolDetail } =
      typeof poolId === "string"
        ? derivedDataStore.getForPool(poolId as string)
        : {
          poolDetail: undefined,
          superfluidPoolDetail: undefined,
        };
    const pool = poolDetail?.pool;

    // user analytics
    const { poolName } = useMemo(
      () => ({
        poolName: pool?.poolAssets
          .map((poolAsset) => poolAsset.amount.denom)
          .join(" / "),
        poolWeight: pool?.weightedPoolInfo?.assets
          .map((poolAsset) => poolAsset.weightFraction.toString())
          .join(" / "),
      }),
      [pool?.poolAssets]
    );

    return (
      <div className={classNames("flex flex-col gap-8", className)}>
        {(() => {
          switch (view) {
            case AddConcLiquidityModalView.Overview:
              return (
                <Overview
                  pool={pool}
                  poolName={poolName}
                  poolDetail={poolDetail}
                  superfluidPoolDetail={superfluidPoolDetail}
                  setView={setView}
                />
              )
            case AddConcLiquidityModalView.AddConcLiq:
              return (
                <AddConcLiqView
                  pool={pool}
                  addLiquidityConfig={addLiquidityConfig}
                  actionButton={actionButton}
                  setView={setView}
                />
              );
            case AddConcLiquidityModalView.AddFullRange:
              return null;
          }
        })()}
      </div>
    );
  }
);

const Overview: FunctionComponent<
  {
    pool?: ObservableQueryPool;
    poolName?: string;
    poolDetail?: ObservablePoolDetail;
    superfluidPoolDetail?: ObservableSuperfluidPoolDetail;
    setView: (view: AddConcLiquidityModalView) => void;
  } & CustomClasses
> = observer(({ setView, pool, poolName, superfluidPoolDetail, poolDetail }) => {
  const {
    priceStore,
    queriesExternalStore,
  } = useStore();
  const router = useRouter();
  const { id: poolId } = router.query as { id: string };
  const t = useTranslation();
  const [selected, selectView] = useState<AddConcLiquidityModalView>(AddConcLiquidityModalView.AddFullRange);
  const queryGammPoolFeeMetrics = queriesExternalStore.queryGammPoolFeeMetrics;

  return (
    <>
      <div className="flex flex-row align-center relative">
        <div className="h-full flex items-center absolute left-0 text-sm" />
        <div className="flex-1 text-center text-lg">
          {t('addLiquidity.title')}
        </div>
        <div className="h-full flex items-center absolute right-0 text-xs font-subtitle2 text-osmoverse-200" />
      </div>
      <div className="flex flex-row bg-osmoverse-900/[.3] px-8 py-4 rounded-[28px]">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-row flex-nowrap items-center gap-2">
            {pool && (
              <PoolAssetsIcon
                assets={pool.poolAssets.map((asset: {amount: CoinPretty}) => ({
                  coinDenom: asset.amount.denom,
                  coinImageUrl: asset.amount.currency.coinImageUrl,
                }))}
                size="sm"
              />
            )}
            <h5 className="max-w-xs truncate">{poolName}</h5>
          </div>
          {superfluidPoolDetail?.isSuperfluid && (
            <span className="body2 text-superfluid-gradient">
              {t("pool.superfluidEnabled")}
            </span>
          )}
          {pool?.type === "stable" && (
            <div className="body2 text-gradient-positive flex items-center gap-1.5">
              <Image
                alt=""
                src="/icons/stableswap-pool.svg"
                height={24}
                width={24}
              />
              <span>{t("pool.stableswapEnabled")}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-10">
          <div className="space-y-2">
              <span className="body2 gap-2 text-osmoverse-400">
                {t("pool.24hrTradingVolume")}
              </span>
            <h5 className="text-osmoverse-100">
              {queryGammPoolFeeMetrics
                .getPoolFeesMetrics(poolId, priceStore)
                .volume24h.toString()}
            </h5>
          </div>
          <div className="space-y-2">
              <span className="body2 gap-2 text-osmoverse-400">
                {t("pool.liquidity")}
              </span>
            <h5 className="text-osmoverse-100">
              {poolDetail?.totalValueLocked.toString()}
            </h5>
          </div>
          <div className="space-y-2">
              <span className="body2 gap-2 text-osmoverse-400">
                {t("pool.swapFee")}
              </span>
            <h5 className="text-osmoverse-100">
              {pool?.swapFee.toString()}
            </h5>
          </div>
        </div>
      </div>
      <div className="flex flex-col mt-[2.75rem]">
        <div className="flex flex-row justify-center gap-8">
          <div
            className={classNames("flex flex-col w-[14.0625rem] items-center gap-4 py-6 border-osmoverse-700 border-2 rounded-[20px] hover:bg-osmoverse-700 hover:border-osmoverse-100 cursor-pointer", {
              "bg-osmoverse-700 border-osmoverse-100": selected === AddConcLiquidityModalView.AddFullRange,
            })}
            onClick={() => selectView(AddConcLiquidityModalView.AddFullRange)}
          >
            <h6>Full range</h6>
            <div className="subtitle1 text-osmoverse-200">Full range</div>
          </div>
          <div
            className={classNames("flex flex-col w-[14.0625rem] items-center gap-4 py-6 border-osmoverse-700 border-2 rounded-[20px] hover:bg-osmoverse-700 hover:border-osmoverse-100 cursor-pointer", {
              "bg-osmoverse-700 border-osmoverse-100": selected === AddConcLiquidityModalView.AddConcLiq,
            })}
            onClick={() => selectView(AddConcLiquidityModalView.AddConcLiq)}
          >
            <h6>Concentrated</h6>
            <div className="subtitle1 text-osmoverse-200">Customized ranges</div>
          </div>
        </div>
        <div className="flex w-full items-center justify-center py-10">
          <span className="text-subtitle1 w-[22rem] text-osmoverse-100">
            This strategy LPs in a +/-10% range of the 30 day TWAP (time weighted average price).
          </span>
        </div>
      </div>
      <div className="flex w-full items-center justify-center">
        <Button
          className="w-[25rem]"
          onClick={() => setView(selected)}
        >
          Next
        </Button>
      </div>
    </>
  )
});

const AddConcLiqView: FunctionComponent<
  {
    pool?: ObservableQueryPool;
    addLiquidityConfig: ObservableAddLiquidityConfig;
    actionButton: ReactNode;
    getFiatValue?: (coin: CoinPretty) => PricePretty | undefined;
    setView: (view: AddConcLiquidityModalView) => void;
  } & CustomClasses
> = observer(
  ({
    className,
    addLiquidityConfig,
    actionButton,
    getFiatValue,
    setView,
    pool,
  }) => {
    const { chainStore } = useStore();
    const { isMobile } = useWindowSize();
    const t = useTranslation();
    const {
      priceStore,
    } = useStore();

    const [inputMin, setInputMin] = useState(yRange.last * 0.85);
    const [inputMax, setInputMax] = useState(yRange.last * 1.15);
    const [min, setMin] = useState(yRange.last * 0.85);
    const [max, setMax] = useState(yRange.last * 1.15);

    const {coinGeckoId: baseAssetId} = pool?.poolAssets[0].amount.currency || {};
    const baseDenom = pool?.poolAssets[0].amount.denom;
    const {coinGeckoId: quoteAssetId} = pool?.poolAssets[1].amount.currency || {};
    const quoteDenom = pool?.poolAssets[1].amount.denom;

    return (
      <>
        <div className="flex flex-row align-center relative">
          <div
            className="h-full flex items-center absolute left-0 text-sm cursor-pointer"
            onClick={() => setView(AddConcLiquidityModalView.Overview)}
          >
            {"<- Back"}
          </div>
          <div className="flex-1 text-center text-lg">
            {t('addLiquidity.title')}
          </div>
          <div className="h-full flex items-center absolute right-0 text-xs font-subtitle2 text-osmoverse-200">
            {`Prices shown in ${baseDenom} per ${quoteDenom}`}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="px-2 py-1 text-sm">Price Range</div>
          <div className="flex flex-row">
            <div className="flex flex-col flex-1 flex-shrink-1 w-0 bg-osmoverse-700 h-[20.1875rem]">
              <div className="flex flex-row">
                <div className="flex-1 flex flex-row pt-4 pl-4">
                  <h4 className="row-span-2 pr-1 font-caption">
                    {data1[data1.length - 1].price.toFixed(2)}
                  </h4>
                  <div className="flex flex-col justify-center font-caption">
                    <div className="text-caption text-osmoverse-300">current price</div>
                    <div className="text-caption text-osmoverse-300">{`${baseDenom} per ${quoteDenom}`}</div>
                  </div>
                </div>
                <div className="flex-1 flex flex-row justify-end pt-2 pr-2 gap-1">
                  <div
                    className="flex flex-row items-center justify-center bg-osmoverse-800 text-xs h-6 w-14 rounded-md hover:bg-osmoverse-900 cursor-pointer"
                  >
                    7 day
                  </div>
                  <div
                    className="flex flex-row items-center justify-center bg-osmoverse-800 text-xs h-6 w-14 rounded-md hover:bg-osmoverse-900 cursor-pointer"
                  >
                    30 day
                  </div>
                  <div
                    className="flex flex-row items-center justify-center bg-osmoverse-800 text-xs h-6 w-14 rounded-md hover:bg-osmoverse-900 cursor-pointer"
                  >
                    1 year
                  </div>
                </div>
              </div>
              <LineChart />
            </div>
            <div className="flex flex-row flex-1 flex-shrink-1 w-0 bg-osmoverse-700 h-[20.1875rem]">
              <BarChart
                min={min}
                max={max}
                onMoveMax={debounce(setInputMax, 100)}
                onMoveMin={debounce(setInputMin, 100)}
                onSubmitMin={val => {
                  const value = Number(val.toFixed(4));
                  setMin(value);
                  setInputMin(value);
                }}
                onSubmitMax={val => {
                  const value = Number(val.toFixed(4));
                  setMax(value);
                  setInputMax(value);
                }}
              />
              <div className="flex flex-col justify-center items-center pr-8 gap-4">
                <PriceInputBox
                  currentValue={inputMax}
                  label="high"
                  onChange={val => {
                    setMax(Number(val));
                    setInputMax(Number(val));
                  }}
                />
                <PriceInputBox
                  currentValue={inputMin}
                  label="low"
                  onChange={val => {
                    setMin(Number(val));
                    setInputMin(Number(val));
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-row">
          <div className="flex flex-col max-w-[15rem] px-4">
            <div className="text-subtitle1">Select volatility range</div>
            <div className="text-body2 text-osmoverse-200">
              Tight ranges earn more fees per dollar, but earn no fees when price is out of range.
            </div>
          </div>
          <div className="flex-1 flex flex-row justify-end gap-4">
            <PresetVolatilityCard src="/images/profile-ammelia.png" />
            <PresetVolatilityCard src="/images/profile-woz.png" />
            <PresetVolatilityCard
              src="/images/profile-dogemosis.png"
              width={70}
              height={70}
            />
          </div>
        </div>
        <div className="flex flex-col">
          <div className="px-2 py-1 text-sm">Amount to deposit</div>
          <div>
            <div className="flex flex-row">
              <div className="flex flex-row">
                { pool?.poolAssets[0].amount.currency.coinImageUrl && (
                  <Image
                    src={pool.poolAssets[0].amount.currency.coinImageUrl}
                    height={44}
                    width={44}
                  />
                )}
                <div className="flex flex-col">
                  <div>{baseDenom?.toUpperCase()}</div>
                </div>
                <div>
                  <div>
                    <InputBox
                      currentValue={'0'}
                      onInput={() => null}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {actionButton}
      </>
    );
  }
);

function DepositAmountGroup() {
  return (
    <div className="flex flex-row">
      <div className="flex flex-row">
        { pool?.poolAssets[0].amount.currency.coinImageUrl && (
          <Image
            src={pool.poolAssets[0].amount.currency.coinImageUrl}
            height={44}
            width={44}
          />
        )}
        <div className="flex flex-col">
          <div>{baseDenom?.toUpperCase()}</div>
        </div>
        <div>
          <div>
            <InputBox
              currentValue={'0'}
              onInput={() => null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function PresetVolatilityCard(props: {
  src: string;
  width?: number;
  height?: number;
}) {
  return (
    <div className="flex flex-row w-[10rem] h-[5.625rem] bg-osmoverse-700 rounded-[1.125rem] overflow-hidden">
      <div className="flex flex-col justify-end">
        <Image
          className="self-end flex-0 flex-shrink-0 ml-2"
          src={props.src}
          width={props.width || 87}
          height={props.height || 87}
        />
      </div>
    </div>
  )
}

function PriceInputBox(props: { label: string; currentValue: number; onChange: (val: string) => void}) {
  return (
    <div className="flex flex-col items-end bg-osmoverse-800 rounded-xl max-w-[9.75rem] px-2">
      <span className="text-osmoverse-400 px-2 pt-2">{props.label}</span>
      <InputBox
        className="bg-transparent border-0 text-h6 leading-tight"
        type="number"
        rightEntry
        currentValue={'' + props.currentValue}
        onInput={val => props.onChange(Number(val).toFixed(4))}
      />
    </div>
  )
}

function LineChart() {
  const yRange = getRangeFromData(data1.map(accessors.yAccessor));

  return (
    <ParentSize
      className="flex-1 flex-shrink-1 overflow-hidden"
    >
      {({height, width}) => {
        return (
          <XYChart
            key="line-chart"
            margin={{ top: 0, right: 0, bottom: 36, left: 50 }}
            height={height}
            width={width}
            xScale={{
              type: 'utc',
              paddingInner: 0.5,
            }}
            yScale={{
              type: 'linear',
              domain: [yRange.min, yRange.max],
              zero: false,
            }}
            theme={buildChartTheme({
              backgroundColor: "transparent",
              colors: ["white"],
              gridColor: theme.colors.osmoverse['600'],
              gridColorDark: theme.colors.osmoverse['300'],
              svgLabelSmall: {
                fill: theme.colors.osmoverse['300'],
                fontSize: 12,
                fontWeight: 500,
              },
              svgLabelBig: {
                fill: theme.colors.osmoverse['300'],
                fontSize: 12,
                fontWeight: 500,
              },
              tickLength: 1,
              xAxisLineStyles: {
                strokeWidth: 0,
              },
              xTickLineStyles: {
                strokeWidth: 0,
              },
              yAxisLineStyles: {
                strokeWidth: 0,
              },
            })}
          >
            <AnimatedAxis
              orientation="bottom"
              numTicks={4}
            />
            <AnimatedAxis
              orientation="left"
              numTicks={5}
              strokeWidth={0}
            />
            <AnimatedGrid
              columns={false}
              // rows={false}
              numTicks={5}
            />
            <AnimatedLineSeries
              dataKey="price"
              data={data1}
              curve={curveNatural}
              {...accessors}
              stroke={theme.colors.wosmongton['200']}
            />
            <Tooltip
              // showVerticalCrosshair
              // showHorizontalCrosshair
              snapTooltipToDatumX
              snapTooltipToDatumY
              detectBounds
              showDatumGlyph
              glyphStyle={{
                strokeWidth: 0,
                fill: theme.colors.wosmongton['200'],
              }}
              horizontalCrosshairStyle={{
                strokeWidth: 1,
                stroke: '#ffffff',
              }}
              verticalCrosshairStyle={{
                strokeWidth: 1,
                stroke: '#ffffff',
              }}
              renderTooltip={({ tooltipData, colorScale }) => {
                return (
                  <div className={`bg-osmoverse-800 p-2 text-xs leading-4`}>
                    <div className="text-white-full">
                      {tooltipData.nearestDatum.datum.price.toFixed(4)}
                    </div>
                    <div className="text-osmoverse-300">
                      {`High: ${Math.max(...data1.map(accessors.yAccessor)).toFixed(4)}`}
                    </div>
                    <div className="text-osmoverse-300">
                      {`Low: ${Math.min(...data1.map(accessors.yAccessor)).toFixed(4)}`}
                    </div>
                  </div>
                )
              }}
            />
          </XYChart>
        );
      }}
    </ParentSize>
  );
}

function BarChart(props: {
  min: number;
  max: number;
  onMoveMax: (value: number) => void;
  onSubmitMax: (value: number) => void;
  onMoveMin: (value: number) => void;
  onSubmitMin: (value: number) => void;
}) {
  const xMax = Math.max(...depthData.map(d => d.depth)) * 1.2;

  return (
    <ParentSize className="flex-1 flex-shrink-1 overflow-hidden">
      {({height, width}) => {
        const yScale = scaleLinear({
          range: [52, height - 36],
          domain: [yRange.max, yRange.min],
          zero: false,
        });

        return (
          <XYChart
            key="bar-chart"
            captureEvents={false}
            margin={{ top: 52, right: 36, bottom: 36, left: 0 }}
            height={height}
            width={width}
            xScale={{
              type: 'linear',
              domain: [
                0,
                xMax,
              ],
            }}
            yScale={{
              type: 'linear',
              // range: [64, height - 36],
              domain: [yRange.min, yRange.max],
              zero: false,
            }}
            theme={buildChartTheme({
              backgroundColor: "transparent",
              colors: ["white"],
              gridColor: theme.colors.osmoverse['600'],
              gridColorDark: theme.colors.osmoverse['300'],
              svgLabelSmall: {
                fill: theme.colors.osmoverse['300'],
                fontSize: 12,
                fontWeight: 500,
              },
              svgLabelBig: {
                fill: theme.colors.osmoverse['300'],
                fontSize: 12,
                fontWeight: 500,
              },
              tickLength: 1,
              xAxisLineStyles: {
                strokeWidth: 0,
              },
              xTickLineStyles: {
                strokeWidth: 0,
              },
              yAxisLineStyles: {
                strokeWidth: 0,
              },
            })}
            horizontal={true}
          >
            {/* Uncomment when testing alignment */}
            {/*<AnimatedAxis*/}
            {/*  orientation="right"*/}
            {/*  numTicks={5}*/}
            {/*  strokeWidth={0}*/}
            {/*/>*/}
            <AnimatedGrid
              columns={false}
              rows={false}
              numTicks={5}
            />
            <AnimatedBarSeries
              dataKey="depth"
              data={depthData}
              xAccessor={(d: any) => d?.depth}
              yAccessor={(d: any) => d?.tick}
              colorAccessor={() => theme.colors.barFill}
            />
            <Annotation
              dataKey="depth"
              xAccessor={(d: any) => d.depth}
              yAccessor={(d: any) => d.tick}
              datum={{tick: yRange.last, depth: xMax}}
            >
              <AnnotationConnector />
              <AnnotationCircleSubject
                stroke={theme.colors.wosmongton["200"]}
                // @ts-ignore
                strokeWidth={4}
                radius={2}
              />
              <AnnotationLineSubject
                orientation="horizontal"
                stroke={theme.colors.wosmongton["200"]}
                strokeWidth={3}
              />
            </Annotation>
            <DragContainer
              defaultValue={props.max || yRange.last * 1.15}
              length={xMax}
              scale={yScale}
              stroke={theme.colors.wosmongton['500']}
              onMove={props.onMoveMax}
              onSubmit={props.onSubmitMax}
            />
            <DragContainer
              defaultValue={props.min || yRange.last * .85}
              length={xMax}
              scale={yScale}
              stroke={theme.colors.bullish["500"]}
              onMove={props.onMoveMin}
              onSubmit={props.onSubmitMin}
            />
            <style>{`
              .visx-bar {
                stroke: ${theme.colors.barFill};
                stroke-width: 3px;
              }
            `}</style>
          </XYChart>
        );
      }}
    </ParentSize>
  );
}

function DragContainer(props: {
  defaultValue?: number,
  length?: number,
  scale: any,
  onMove?: (value: number) => void;
  onSubmit?: (value: number) => void;
  stroke: string,
}) {
  return (
    <Annotation
      dataKey="depth"
      xAccessor={(d: any) => d?.depth}
      yAccessor={(d: any) => d?.tick}
      // datum={{tick: yRange.last * .85, depth: xMax}}
      datum={{tick: props.defaultValue, depth: props.length}}
      canEditSubject
      canEditLabel={false}
      onDragMove={({ event, ...nextPos}) => {
        if (props.onMove) props.onMove(props.scale.invert(nextPos.y));
      }}
      onDragEnd={({ event, ...nextPos}) => {
        if (props.onSubmit) props.onSubmit(props.scale.invert(nextPos.y));
      }}
      editable
    >
      <AnnotationConnector />
      <AnnotationCircleSubject
        stroke={props.stroke}
        // @ts-ignore
        strokeWidth={8}
        radius={2}
      />
      <AnnotationLineSubject
        orientation="horizontal"
        stroke={props.stroke}
        strokeWidth={3}
      />
    </Annotation>
  )
}