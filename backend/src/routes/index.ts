import { Router } from "express";
import signupRouter from "./signup";
import loginRouter from "./login";
import verifyEmailRouter from "./verify-email";
import resetCodeRouter from "./reset-code";
import resetPasswordRouter from "./reset-password";
import profileRouter from "./profile";
import outingRouter from "./outing";
import removeAccountRouter from "./removeaccount";
import updatePassword from "./password-update";
import friendsRouter from "./friends";
import preferencesRouter from "./preferences";

const router = Router();

// optional health so your frontend check keeps working
router.get("/health", (_req, res) => res.json({ status: "OK" }));

// keep paths the same as before
router.use(signupRouter); // POST /signup
router.use(loginRouter); // POST /login
router.use(verifyEmailRouter); // POST /verify-email
router.use(resetCodeRouter); // POST /resend-code
router.use(resetPasswordRouter); // POST /reset_password
router.use(profileRouter); // GET /api/profile/me, PATCH /api/profile
router.use(outingRouter);
router.use(removeAccountRouter); // DELETE /api/account
router.use(updatePassword); // POST /update_password
router.use(friendsRouter); // GET/POST/DELETE /api/friends
router.use(preferencesRouter);

export default router;
