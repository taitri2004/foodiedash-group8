import { Router } from 'express';
import { authenticate } from '@/middlewares';
import { getMeHandler } from '@/controllers/auth.controller';
import { updateMeHandler, changePasswordHandler, updateMyAvatarHandler } from '@/controllers/user.controller';
import { getMyPointsHistoryHandler, getMyMembershipHandler, claimReferralHandler } from '@/controllers/membership.controller';
import { uploadImage } from "@/config/multer";
import { updateMeHandler, changePasswordHandler, updateMyAvatarHandler, updateMyAvatarS3Handler } from '@/controllers/user.controller';

// Thêm route mới:
const userRoutes = Router();

userRoutes.get('/me', authenticate, getMeHandler);
userRoutes.patch('/me', authenticate, updateMeHandler);
userRoutes.patch('/me/password', authenticate, changePasswordHandler);
userRoutes.patch("/me/avatar", authenticate, uploadImage.single("file"), updateMyAvatarHandler);
userRoutes.patch("/me/avatar-s3", authenticate, updateMyAvatarS3Handler);

userRoutes.get('/me/points', authenticate, getMyPointsHistoryHandler);
userRoutes.get('/me/membership', authenticate, getMyMembershipHandler);
userRoutes.post('/me/referral/claim', authenticate, claimReferralHandler);

export default userRoutes;