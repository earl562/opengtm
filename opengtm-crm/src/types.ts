export type Id = string;

export type Account = {
  id: Id;
  name: string;
  createdAt: string;
};

export type Contact = {
  id: Id;
  accountId: Id | null;
  name: string;
  email: string | null;
  createdAt: string;
};

export type Lead = {
  id: Id;
  name: string;
  email: string | null;
  status: "new" | "qualified" | "disqualified";
  createdAt: string;
};

export type Opportunity = {
  id: Id;
  accountId: Id | null;
  name: string;
  amountCents: number | null;
  stage: "open" | "won" | "lost";
  createdAt: string;
};

export type Activity = {
  id: Id;
  subject: string;
  type: "note" | "call" | "email";
  relatedType: "account" | "lead" | "opportunity" | null;
  relatedId: Id | null;
  createdAt: string;
};
