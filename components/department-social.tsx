import { Facebook, Globe, Instagram, Link2, Linkedin, Twitter, Youtube } from "lucide-react";
import { publicSocialLinks } from "@/lib/store";
import type { DepartmentSocialLink } from "@/lib/types";

const platforms: Record<string, { label: string; Icon: typeof Globe }> = {
  INSTAGRAM: { label: "Instagram", Icon: Instagram },
  FACEBOOK: { label: "Facebook", Icon: Facebook },
  LINKEDIN: { label: "LinkedIn", Icon: Linkedin },
  X: { label: "X (Twitter)", Icon: Twitter },
  YOUTUBE: { label: "YouTube", Icon: Youtube },
  WEBSITE: { label: "Official website", Icon: Globe },
  OTHER: { label: "Official link", Icon: Link2 },
};

/**
 * Department-owned official channels. Only configured, validated URLs are
 * published, and the section is not rendered at all when the department has no
 * links. Everything here is a plain external link with an accessible label.
 */
export function DepartmentSocialLinks({ links, departmentName }: { links?: DepartmentSocialLink[]; departmentName: string }) {
  const configured = publicSocialLinks(links);
  if (!configured.length) return null;
  return <ul className="department-social">
    {configured.map((link, index) => {
      const platform = platforms[String(link.platform).toUpperCase()] || platforms.OTHER;
      const text = link.platform === "OTHER" && link.label ? link.label : platform.label;
      return <li key={link.id || `${link.platform}-${index}`}>
        <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${departmentName} — ${text} (opens in a new tab)`}>
          <platform.Icon size={17} aria-hidden="true" /> {text}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>;
    })}
  </ul>;
}
