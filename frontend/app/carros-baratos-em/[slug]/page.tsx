import { createLocalSeoPage, LOCAL_SEO_REVALIDATE } from "@/lib/seo/local-seo-route";

export const revalidate = LOCAL_SEO_REVALIDATE;

const { generateMetadata, Page } = createLocalSeoPage("baratos");

export { generateMetadata };
export default Page;
