import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { APIError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.headers("Authorization")?.replace("Bearer ", "");

    // console.log(token);
    if (!token) {
      throw new APIError(401, "Unauthorized request");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
      );
      
      if (!user) {
        throw new APIError(401, "Invalid Access Token");
      }
      
      req.user = user;
    next();
  } catch (error) {
    throw new APIError(401, error?.message || "Invalid Access Token");
  }
});
