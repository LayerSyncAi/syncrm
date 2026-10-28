/**
 * Landlord and tenant form values and the person shape the Stay mutations
 * take. Copied from src/components/stay/person-fields.tsx, which is a web
 * component and cannot be imported here.
 */
export type PersonForm = {
  name: string;
  phone: string;
  email: string;
  entityKind: "individual" | "company";
  idNumber: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
};

export const EMPTY_PERSON: PersonForm = {
  name: "",
  phone: "",
  email: "",
  entityKind: "individual",
  idNumber: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  branch: "",
};

export function personArg(f: PersonForm, withBank: boolean) {
  const t = (s: string) => s.trim() || undefined;
  return {
    name: f.name.trim(),
    phone: t(f.phone),
    email: t(f.email),
    entityKind: f.entityKind,
    idNumber: t(f.idNumber),
    ...(withBank
      ? {
          bankDetails: {
            bankName: t(f.bankName),
            accountName: t(f.accountName),
            accountNumber: t(f.accountNumber),
            branch: t(f.branch),
          },
        }
      : {}),
  };
}

export function personFormFrom(p: {
  name: string;
  phone?: string;
  email?: string;
  entityKind?: string;
  idNumber?: string;
  bankDetails?: { bankName?: string; accountName?: string; accountNumber?: string; branch?: string };
}): PersonForm {
  return {
    name: p.name,
    phone: p.phone ?? "",
    email: p.email ?? "",
    entityKind: p.entityKind === "company" ? "company" : "individual",
    idNumber: p.idNumber ?? "",
    bankName: p.bankDetails?.bankName ?? "",
    accountName: p.bankDetails?.accountName ?? "",
    accountNumber: p.bankDetails?.accountNumber ?? "",
    branch: p.bankDetails?.branch ?? "",
  };
}
