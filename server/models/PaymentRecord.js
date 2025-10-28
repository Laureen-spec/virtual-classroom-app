import mongoose from "mongoose";

const paymentRecordSchema = new mongoose.Schema(
  {
    student: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    subscription: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Subscription" 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    phone: { 
      type: String, 
      required: true 
    },
    transactionId: { 
      type: String, 
      required: true 
    },
    status: { 
      type: String, 
      enum: ["success", "failed", "pending"], 
      default: "success" 
    },
    paymentMethod: { 
      type: String, 
      default: "M-Pesa" 
    },
    description: { 
      type: String, 
      default: "Weekly Subscription Payment" 
    }
  },
  { timestamps: true }
);

export default mongoose.model("PaymentRecord", paymentRecordSchema);