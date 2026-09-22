// ===== 规则层：版本链选择器（只读派生） =====
import type { Assessment } from "../data/types";

export interface AssessmentChain {
  chainId: string;
  versions: Assessment[];
  latest: Assessment;
}

/** 按链聚合，版本升序；只含至少存在一版的链 */
export function selectChains(assessments: Assessment[]): AssessmentChain[] {
  const map = new Map<string, Assessment[]>();
  assessments.forEach((a) => {
    const list = map.get(a.chainId) ?? [];
    list.push(a);
    map.set(a.chainId, list);
  });
  return [...map.values()]
    .map((list) => {
      const versions = [...list].sort((a, b) => a.version - b.version || a.createdAt - b.createdAt);
      return { chainId: versions[0].chainId, versions, latest: versions[versions.length - 1] };
    })
    .sort((x, y) => y.latest.createdAt - x.latest.createdAt);
}

export function chainOf(assessments: Assessment[], chainId: string): AssessmentChain | undefined {
  return selectChains(assessments).find((c) => c.chainId === chainId);
}

/** 同链旧版本 */
export function previousVersion(chain: AssessmentChain, version: number): Assessment | undefined {
  return chain.versions.find((v) => v.version === version - 1);
}
