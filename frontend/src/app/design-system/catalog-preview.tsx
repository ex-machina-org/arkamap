import { FREE_COMPONENT_PREVIEWS } from "@/components/application/docs/component-previews-free";
import type { PreviewHref } from "@/components/application/docs/component-preview-hrefs";

export default function CatalogPreview({ slug }: { slug: string }) {
  const Preview = FREE_COMPONENT_PREVIEWS[`/components/${slug}` as PreviewHref];
  return Preview ? <Preview /> : <div className="flex h-full items-center justify-center text-sm text-text-secondary">Preview unavailable</div>;
}
