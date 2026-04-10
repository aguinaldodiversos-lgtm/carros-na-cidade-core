import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";

/** UFs derivadas da fonte canônica em `lib/city/brazil-ufs.ts`. */
export const BR_UF_VALUES = BRAZIL_UFS.map((uf) => uf.value);

export type BrazilUf = (typeof BRAZIL_UFS)[number]["value"];
