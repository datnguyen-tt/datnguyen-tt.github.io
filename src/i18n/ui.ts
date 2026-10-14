import type { Domain, Lang, Strategy } from "../data/cv";

export interface SectionText {
  title: string;
  hint: string;
}

export interface UI {
  htmlLang: string;
  skip: string;
  navLabel: string;
  menu: string;
  stack: string;
  nav: {
    about: string;
    experience: string;
    skills: string;
    projects: string;
    publications: string;
    education: string;
    contact: string;
  };
  sections: {
    about: SectionText;
    experience: SectionText;
    skills: SectionText;
    projects: SectionText;
    publications: SectionText;
    education: SectionText;
    contact: SectionText;
  };
  cta: { download: string; contact: string; github: string };
  availability: string;
  present: string;
  offset: string;
  remote: string;
  onsite: string;
  domain: Record<Domain, string>;
  strategy: Record<Strategy, string>;
  strategyLabel: string;
  supervisorLabel: string;
  theme: { toLight: string; toDark: string };
  motion: { label: string; on: string; off: string };
  lang: { switchLabel: string; short: string; code: string };
  terminalTitle: string;
  viewRepo: string;
  doi: string;
  bibtex: string;
  copyBibtex: string;
  copied: string;
  degrees: string;
  awards: string;
  languages: string;
  contactEmail: string;
  contactLinkedin: string;
  contactGithub: string;
  contactLocation: string;
  built: string;
}

export const ui: Record<Lang, UI> = {
  en: {
    htmlLang: "en",
    skip: "Skip to content",
    navLabel: "Primary",
    menu: "Menu",
    stack: "Tech stack",
    nav: {
      about: "About",
      experience: "Experience",
      skills: "Skills",
      projects: "Projects",
      publications: "Publications",
      education: "Education",
      contact: "Contact",
    },
    sections: {
      about: { title: "About", hint: "mailbox: 4 messages, FIFO" },
      experience: {
        title: "Experience",
        hint: "append-only log · offset 0 = oldest record",
      },
      skills: {
        title: "Skills",
        hint: "supervision tree · restart strategy per group",
      },
      projects: { title: "Projects", hint: "public repositories" },
      publications: { title: "Publications", hint: "peer-reviewed" },
      education: { title: "Education", hint: "degrees · awards · languages" },
      contact: { title: "Contact", hint: "async send, no ack required" },
    },
    cta: {
      download: "Download CV (PDF)",
      contact: "Contact",
      github: "GitHub",
    },
    availability: "Availability",
    present: "present",
    offset: "offset",
    remote: "remote",
    onsite: "onsite",
    domain: { iot: "IoT", telecom: "Telecom", network: "Network automation" },
    strategy: {
      one_for_one: "one_for_one",
      one_for_all: "one_for_all",
      rest_for_one: "rest_for_one",
    },
    strategyLabel: "restart strategy",
    supervisorLabel: "supervisor",
    theme: {
      toLight: "Switch to light theme",
      toDark: "Switch to dark theme",
    },
    motion: { label: "Motion", on: "on", off: "off" },
    lang: {
      switchLabel: "Switch to Vietnamese",
      short: "VI",
      code: "vi",
    },
    terminalTitle: "erl — dat@cv",
    viewRepo: "View on GitHub",
    doi: "DOI",
    bibtex: "BibTeX",
    copyBibtex: "Copy BibTeX",
    copied: "Copied",
    degrees: "Degrees",
    awards: "Awards",
    languages: "Languages",
    contactEmail: "Email",
    contactLinkedin: "LinkedIn",
    contactGithub: "GitHub",
    contactLocation: "Location",
    built: "built",
  },
  vi: {
    htmlLang: "vi",
    skip: "Bỏ qua, đến nội dung chính",
    navLabel: "Điều hướng chính",
    menu: "Menu",
    stack: "Công nghệ sử dụng",
    nav: {
      about: "Giới thiệu",
      experience: "Kinh nghiệm",
      skills: "Kỹ năng",
      projects: "Dự án",
      publications: "Công bố",
      education: "Học vấn",
      contact: "Liên hệ",
    },
    sections: {
      about: { title: "Giới thiệu", hint: "mailbox: 4 message, FIFO" },
      experience: {
        title: "Kinh nghiệm",
        hint: "log chỉ ghi thêm · offset 0 = bản ghi cũ nhất",
      },
      skills: {
        title: "Kỹ năng",
        hint: "supervision tree · chiến lược restart theo nhóm",
      },
      projects: { title: "Dự án", hint: "repository công khai" },
      publications: { title: "Công bố", hint: "đã qua bình duyệt" },
      education: {
        title: "Học vấn",
        hint: "bằng cấp · giải thưởng · ngôn ngữ",
      },
      contact: { title: "Liên hệ", hint: "gửi bất đồng bộ, không cần ack" },
    },
    cta: {
      download: "Tải CV (PDF)",
      contact: "Liên hệ",
      github: "GitHub",
    },
    availability: "Tình trạng",
    present: "hiện tại",
    offset: "offset",
    remote: "từ xa",
    onsite: "tại chỗ",
    domain: {
      iot: "IoT",
      telecom: "Viễn thông",
      network: "Tự động hóa mạng",
    },
    strategy: {
      one_for_one: "one_for_one",
      one_for_all: "one_for_all",
      rest_for_one: "rest_for_one",
    },
    strategyLabel: "chiến lược restart",
    supervisorLabel: "supervisor",
    theme: {
      toLight: "Chuyển sang giao diện sáng",
      toDark: "Chuyển sang giao diện tối",
    },
    motion: { label: "Chuyển động", on: "bật", off: "tắt" },
    lang: {
      switchLabel: "Chuyển sang tiếng Anh",
      short: "EN",
      code: "en",
    },
    terminalTitle: "erl — dat@cv",
    viewRepo: "Xem trên GitHub",
    doi: "DOI",
    bibtex: "BibTeX",
    copyBibtex: "Sao chép BibTeX",
    copied: "Đã sao chép",
    degrees: "Bằng cấp",
    awards: "Giải thưởng",
    languages: "Ngôn ngữ",
    contactEmail: "Email",
    contactLinkedin: "LinkedIn",
    contactGithub: "GitHub",
    contactLocation: "Địa điểm",
    built: "built",
  },
};

export const SECTION_ORDER = [
  "about",
  "experience",
  "skills",
  "projects",
  "publications",
  "education",
  "contact",
] as const;

/** owner/repo for a GitHub URL. */
export function repoSlug(url: string): string {
  return new URL(url).pathname.replace(/^\/|\/$/g, "");
}

/** Strip protocol/trailing slash for display. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
