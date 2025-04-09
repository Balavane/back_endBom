-- CreateTable
CREATE TABLE "Article" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "creationDate" TIMESTAMP(3) NOT NULL,
    "imagePath" TEXT,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);
