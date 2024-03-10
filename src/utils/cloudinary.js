import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    // upload the file on cloudinary
    const responce = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    // // file has been uploaded successfull
    // console.log("file uploaded successfully", responce.url, responce);
    fs.unlinkSync(localFilePath); 
    return responce;
  } catch (error) {
    fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload operation got failed
    return null;
  }
};

const deleteFromCloudinary = async (imageUrl) => {
  try {
    const publicId = extractPublicIdFromUrl(imageUrl).split('.')[0];
    if (!publicId) return null;
    // delete the file from cloudinary
    const responce = await cloudinary.uploader.destroy(publicId);
    // file has been deleted successfull
    // console.log("file deleted successfully", responce);
    return responce;
  } catch (error) {
    return null;
  }
};

function extractPublicIdFromUrl(imageUrl) {
  // Split the URL by '/' (forward slash)
  const urlParts = imageUrl.split('/');

  // Cloudinary public ID is typically between the folder structure (if any) and the extension (e.g., .png, .jpg)
  // Find the index of the last occurrence of '.' (dot)
  const dotIndex = urlParts.lastIndexOf('.');

  // If there's no dot, return the entire last element (potential public ID)
  if (dotIndex === -1) {
    return urlParts.pop();
  }

  // Otherwise, return everything from the element after the last '/' to before the last '.'
  return urlParts.slice(urlParts.findIndex(part => part.includes('/')) + 1, dotIndex).join('/');
}



export { deleteFromCloudinary, uploadOnCloudinary };

