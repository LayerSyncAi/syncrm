import { Alert } from "react-native";
import { toast } from "../toast";

/**
 * After an invite or password reset: confirm the email went out, or, when it
 * could not be sent, show the temporary password once so the admin can pass
 * it on. The server returns the password only in that case.
 */
export function reportSignIn(
  result: { emailed: boolean; tempPassword: string | null } | undefined,
  who: { name: string; email: string },
  emailedMessage: string
) {
  if (!result) return;
  if (result.tempPassword) {
    Alert.alert(
      "The email could not be sent",
      `Give ${who.name} this temporary password yourself. It is shown only once.\n\nEmail: ${who.email}\nTemporary password: ${result.tempPassword}\n\nThey must choose their own password when they first sign in.`
    );
  } else {
    toast.success(emailedMessage);
  }
}
