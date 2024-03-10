import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiResponce } from "../utils/ApiResponce.js";
import { APIError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new APIError(
      500,
      "Something went wrong while generating refresh and access tokens " + error
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user data
  // validate data
  // check if user already exists
  // check for images, check for avater
  // upload them to cloudinary, avater
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  const { fullName, email, password, userName } = req.body;

  if (
    [fullName, email, password, userName].some((field) => field?.trim() === "")
  ) {
    throw new APIError(400, "All fields is required");
  }

  const existingUser = await User.findOne({ $or: [{ userName }, { email }] });

  if (existingUser) {
    throw new APIError(409, "User with email or userName already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath =
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
      ? req.files?.coverImage[0]?.path
      : "";

  if (!avatarLocalPath) {
    throw new APIError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  // if (coverImageLocalPath) {
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  // }
  if (!avatar) {
    throw new APIError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage == "" ? coverImage.url : "",
    email,
    password,
    userName: userName.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new APIError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponce(200, createdUser, "User registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // req body=> data
  // username or email
  // find the user
  // password check
  // access and refresh token
  // send cookie

  const { email, userName, password } = req.body;

  if (!userName && !email) {
    throw new APIError(400, "Username or Email is required");
  }

  const user = await User.findOne({
    $or: [{ userName }, { email }],
  });

  if (!user) {
    throw new APIError(404, "User doesn't exist");
  }

  if (!password) {
    throw new APIError(401, "Password is incorrect");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new APIError(401, "Password is incorrect");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponce(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponce(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new APIError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new APIError(401, "Invalid refresh Token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new APIError(401, "Refresh Token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponce(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed!"
        )
      );
  } catch (error) {
    throw new APIError(401, error?.message || "Invalid refresh Token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user?._id);
  if (!user) {
    throw new APIError(401, "Unauthorized request");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new APIError(400, "Invalid Old Password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponce(200, {}, "Password change successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponce(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email) {
    throw new APIError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      fullName,
      email: email,
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponce(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new APIError(404, "Avatar file not available");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new APIError(400, "Error while uploading on avatar");
  }

  const tempAvatar = req.user?.avatar;

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password");

  await deleteFromCloudinary(tempAvatar);

  return res
    .status(200)
    .json(
      new ApiResponce(200, user, "Avatar Update successfully!")
    );
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new APIError(404, "Cover Image file not available");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new APIError(400, "Error while uploading on avatar");
  }

  const tempCoverImage = req.user?.coverImage;

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");

  await deleteFromCloudinary(tempCoverImage);

  return res
    .status(200)
    .json(new ApiResponce(200, user, "Cover Image Update successfully!"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { userName } = req.params;

  if (!userName) {
    throw new APIError(400, "Username is required");
  }

  const channel = await User.aggregate([
    {
      $match: {
        userName: userName.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subcribersCount: { $size: "$subscribers" },
        channelsSubscribedCount: { $size: "$subscribedTo" },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        userName: 1,
        subcribersCount: 1,
        channelsSubscribedCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new APIError(404, "Channel doesn't exist");
  }

  return res
    .status(200)
    .json(
      new ApiResponce(
        200,
        channel[0],
        "User Channel Profile fetched successfully"
      )
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: req.user._id,
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    userName: 1,
                    avatar: 1,
                  },
                },
                {
                  $addFields: {
                    owner: { $arrayElemAt: ["$owner", 0] },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponce(
        200,
        user[0].watchHistory,
        "Watch History fetched successfully"
      )
    );
});

export {
  changeCurrentPassword,
  getCurrentUser,
  getUserChannelProfile,
  getWatchHistory,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage
};

