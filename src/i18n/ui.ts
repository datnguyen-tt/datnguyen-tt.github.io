import type { Domain, Lang, Strategy } from "../data/cv";

export interface SectionText {
  title: string;
  hint: string;
  hintSub?: string;
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
  cta: {
    download: string;
    linkedin: string;
    email: string;
    github: string;
    githubAria: string;
  };
  contactTerminal: { prompt: string; input: string; output: string };
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
  fx: {
    beamAria: string;
    beamHint: string;
    beamHintMobile: string;
    beamHintSub: string;
    beamDemoBtn: string;
    beamEscalated: string;
    terminalLivePlaceholder: string;
    hudObserver: string;
    hudNodes: string;
    hudMsgs: string;
    hudRestarts: string;
    hudNetsplits: string;
    hudSim: string;
    mailboxAria: string;
    mailboxCaption: string;
    mailboxCaptionSub: string;
    commitPrimary: string;
    commitConsumer: string;
    commitLag: string;
    commitCommitted: string;
    supStrategyControl: string;
    supAsDesigned: string;
    supHint: string;
    supIdle: string;
    supRestartedPrefix: string;
    supRestartedUnit: string;
    supEscalated: string;
    sendAria: string;
    sendBtn: string;
    sendStatus: string;
    sendStatusSub: string;
  };
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
      about: {
        title: "About",
        hint: "4 facts, in order",
      },
      experience: {
        title: "Experience",
        hint: "Newest role first · reading the log",
      },
      skills: {
        title: "Skills",
        hint: "supervision tree · restart strategy per group",
        hintSub: "let it crash · supervisor restarts",
      },
      projects: { title: "Projects", hint: "public repositories" },
      publications: { title: "Publications", hint: "peer-reviewed" },
      education: { title: "Education", hint: "degrees · awards · languages" },
      contact: { title: "Contact", hint: "async send, no ack required" },
    },
    cta: {
      download: "Download CV (PDF)",
      linkedin: "LinkedIn",
      email: "Email",
      github: "GitHub",
      githubAria: "GitHub profile",
    },
    contactTerminal: {
      prompt: "dat@cv>",
      input: "dat ! {hire, You}.",
      output: "{ok, ack}",
    },
    availability: "Availability",
    present: "present",
    offset: "offset",
    remote: "remote",
    onsite: "onsite",
    domain: { iot: "IoT", telecom: "Telecom", network: "Network automation" },
    strategy: {
      one_for_one: "one_for_one (isolated)",
      one_for_all: "one_for_all (group)",
      rest_for_one: "rest_for_one (downstream)",
    },
    strategyLabel: "Restart strategy",
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
    fx: {
      beamAria:
        "Interactive fault-tolerant BEAM mesh simulation: 6 distributed Erlang nodes exchange SIP, Diameter, NETCONF, and MQTT packets; click a worker to crash it or click a node to trigger nodedown failover.",
      beamHint: "Click a worker to crash it · click a node to take it down",
      beamHintMobile: "Tap a worker to crash it · tap a node to take it down",
      beamHintSub: "let it crash · failover",
      beamDemoBtn:
        "Crash a random worker (Enter) or take a random node down (Shift+Enter)",
      beamEscalated:
        "max restart intensity reached — supervisor shut down, parent restarts it",
      terminalLivePlaceholder: "% observing mesh… (events appear here)",
      hudObserver: "observer",
      hudNodes: "nodes",
      hudMsgs: "msgs/s",
      hudRestarts: "restarts",
      hudNetsplits: "netsplits",
      hudSim: "simulation",
      mailboxAria:
        "Process mailbox FIFO and selective receive simulation: messages queue in arrival order and pattern-matched messages are consumed to highlight career metrics.",
      mailboxCaption: "4 facts, in order",
      mailboxCaptionSub: "mailbox: FIFO",
      commitPrimary: "Newest role first · reading the log",
      commitConsumer: "consumer offset",
      commitLag: "lag",
      commitCommitted: "committed",
      supStrategyControl: "Restart strategy",
      supAsDesigned: "as designed",
      supHint: "Click a skill — it crashes and its supervisor restarts it.",
      supIdle:
        "=SUPERVISOR REPORT= sup: dat_sup, status: running (all workers alive)",
      supRestartedPrefix: "Supervisor restarted",
      supRestartedUnit: "skills",
      supEscalated:
        "max restart intensity reached — supervisor shut down, parent restarts it",
      sendAria:
        "Erlang message passing simulation: sending {hire, You} to Dat's mailbox and receiving {ok, ack}.",
      sendBtn: "Send {hire, You}",
      sendStatus: "Message sent",
      sendStatusSub: "{ok, ack}",
    },
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
      about: {
        title: "Giới thiệu",
        hint: "4 số liệu, theo thứ tự",
      },
      experience: {
        title: "Kinh nghiệm",
        hint: "Vị trí mới nhất trước · đang đọc log",
      },
      skills: {
        title: "Kỹ năng",
        hint: "supervision tree · chiến lược restart theo nhóm",
        hintSub: "let it crash · supervisor khởi động lại",
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
      linkedin: "LinkedIn",
      email: "Email",
      github: "GitHub",
      githubAria: "Hồ sơ GitHub",
    },
    contactTerminal: {
      prompt: "dat@cv>",
      input: "dat ! {hire, You}.",
      output: "{ok, ack}",
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
      one_for_one: "one_for_one (độc lập)",
      one_for_all: "one_for_all (toàn nhóm)",
      rest_for_one: "rest_for_one (phía sau)",
    },
    strategyLabel: "Chiến lược restart",
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
    fx: {
      beamAria:
        "Mô phỏng lưới BEAM chịu lỗi tương tác: 6 node Erlang phân tán trao đổi gói tin SIP, Diameter, NETCONF và MQTT; nhấp worker để làm crash hoặc nhấp node để kích hoạt nodedown failover.",
      beamHint: "Nhấp worker để làm crash · nhấp node để ngắt kết nối",
      beamHintMobile: "Chạm worker để làm crash · chạm node để ngắt kết nối",
      beamHintSub: "let it crash · failover",
      beamDemoBtn:
        "Làm crash worker ngẫu nhiên (Enter) hoặc ngắt node ngẫu nhiên (Shift+Enter)",
      beamEscalated:
        "vượt ngưỡng restart tối đa — supervisor dừng, supervisor cha khởi động lại",
      terminalLivePlaceholder:
        "% đang quan sát mesh… (sự kiện sẽ hiện tại đây)",
      hudObserver: "observer",
      hudNodes: "nodes",
      hudMsgs: "msgs/s",
      hudRestarts: "restarts",
      hudNetsplits: "netsplits",
      hudSim: "mô phỏng",
      mailboxAria:
        "Mô phỏng mailbox FIFO và selective receive: message xếp hàng theo thứ tự đến và được khớp mẫu để làm nổi bật các số liệu sự nghiệp.",
      mailboxCaption: "4 số liệu, theo thứ tự",
      mailboxCaptionSub: "mailbox: FIFO",
      commitPrimary: "Vị trí mới nhất trước · đang đọc log",
      commitConsumer: "consumer offset",
      commitLag: "độ trễ",
      commitCommitted: "đã commit",
      supStrategyControl: "Chiến lược restart",
      supAsDesigned: "theo thiết kế",
      supHint: "Nhấp vào một kỹ năng — nó sẽ crash và được supervisor khởi động lại.",
      supIdle:
        "=SUPERVISOR REPORT= sup: dat_sup, status: running (tất cả worker đang chạy)",
      supRestartedPrefix: "Supervisor đã khởi động lại",
      supRestartedUnit: "kỹ năng",
      supEscalated:
        "vượt ngưỡng restart tối đa — supervisor dừng, supervisor cha khởi động lại",
      sendAria:
        "Mô phỏng gửi thông điệp Erlang: gửi {hire, You} vào mailbox của Dat và nhận lại {ok, ack}.",
      sendBtn: "Gửi {hire, You}",
      sendStatus: "Đã gửi thông điệp",
      sendStatusSub: "{ok, ack}",
    },
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
