import boto3

rek = boto3.client('rekognition', region_name='ap-south-1')
COLLECTION_ID = "student_collection"

# 1. Create the searchable index
try:
    rek.create_collection(CollectionId=COLLECTION_ID)
except rek.exceptions.ResourceAlreadyExistsException:
    pass

# 2. Index your Master Photos from S3
s3 = boto3.resource('s3')
bucket = s3.Bucket("facerecognitioniot")

for obj in bucket.objects.all():
    if obj.key.endswith(('.jpg', '.png')):
        name = obj.key.split('.')[0]
        rek.index_faces(
            CollectionId=COLLECTION_ID,
            Image={'S3Object': {'Bucket': "facerecognitioniot", 'Name': obj.key}},
            ExternalImageId=name, # This links the face to the name
            MaxFaces=1
        )
        print(f"Indexed: {name}")