export type TelephonyCallRegion = "seoul" | "daejeon" | "busan" | "unclassified";

const representativeRegionByNumber = new Map<string, TelephonyCallRegion>([
  ["025557455", "seoul"],
  ["025557465", "seoul"],
  ["07046070588", "seoul"],
  ["0424840488", "daejeon"],
  ["0424850488", "daejeon"],
  ["0515021919", "busan"],
  ["0515051909", "busan"],
  // 대표번호가 센트릭스 원회선으로만 관찰되는 경우도 같은 지역으로 분류한다.
  ["07046079605", "seoul"],
  ["07075999388", "seoul"],
  ["07052149190", "daejeon"],
  ["07052257426", "daejeon"],
  ["07052148594", "busan"],
  ["07052257584", "busan"],
]);

function supportedRegion(regionKey: string | null | undefined) {
  return regionKey === "seoul" || regionKey === "daejeon" || regionKey === "busan"
    ? regionKey
    : null;
}

export function classifyTelephonyCallRegion(input: {
  endpointType: "personal" | "representative";
  lineNumber: string;
  publicNumber: string | null;
  endpointRegionKey: string | null;
  ownerRegionKeys: string[];
}): TelephonyCallRegion {
  if (input.endpointType === "representative") {
    const representativeRegion = [input.publicNumber, input.lineNumber]
      .flatMap((number) => number ? [representativeRegionByNumber.get(number)] : [])
      .find((region): region is TelephonyCallRegion => Boolean(region));
    if (representativeRegion) return representativeRegion;
  }

  const regions = new Set(
    [input.endpointRegionKey, ...input.ownerRegionKeys]
      .map(supportedRegion)
      .filter((region): region is Exclude<TelephonyCallRegion, "unclassified"> => Boolean(region)),
  );
  return regions.size === 1 ? [...regions][0]! : "unclassified";
}
