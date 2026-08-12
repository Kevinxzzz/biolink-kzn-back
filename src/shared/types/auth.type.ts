import { loginZod, registerEnterprisePayloadZod } from "../zod/auth.zod";
import { z } from "zod";

export type LoginInput = z.infer<typeof loginZod>;

type RegisterEnterprisePayload = z.infer<typeof registerEnterprisePayloadZod>;

export type RegisterEnterpriseInput = {
    company: RegisterEnterprisePayload["company"];
    user: Omit<RegisterEnterprisePayload["user"], "confirmPassword">;
};