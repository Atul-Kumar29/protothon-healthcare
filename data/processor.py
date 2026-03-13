from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lower, when, lit
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, BooleanType, DoubleType

# Initialize Spark for Delta Lake 4.0
spark = SparkSession.builder \
    .appName("LeakGuard-Delta-Audit") \
    .master("local[*]") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

# Define the exact structure of your clinical JSON (base fields)
schema = StructType(
    [
        StructField("patient_id", StringType(), True),
        StructField("symptoms", ArrayType(StringType()), True),
        StructField("diagnosis", StringType(), True),
        StructField("medication", StringType(), True),
        StructField("dosage", StringType(), True),
        StructField("lab_tests", ArrayType(StringType()), True),
        StructField("raw_transcript", StringType(), True),
        StructField("timestamp", StringType(), True),
        StructField("status", StringType(), True),
    ]
)

# Use the clinical data folder
input_path = "/opt/bitnami/spark/data/raw_clinical/"
delta_path = "/opt/bitnami/spark/data/delta_lake_audit/"

print("--- STARTING CLINICAL DELTA PIPELINE ---")

try:
    # 1. Read JSON with high-compatibility settings
    df = spark.read.schema(schema) \
        .option("multiline", "true") \
        .option("mode", "PERMISSIVE") \
        .json(input_path)

    # 2. Filter out any rows that failed to load
    df = df.dropna(subset=["raw_transcript"])

    if df.count() == 0:
        print("Waiting for data... Folder is currently empty or JSON is invalid.")
    else:
        # 3. Add risk-related columns expected by existing Delta table
        processed_df = (
            df.withColumn("is_leak", lit(False).cast(BooleanType()))
              .withColumn("risk_score", lit(0.0).cast(DoubleType()))
        )

        # 4. Save to Delta Lake (append into existing table schema)
        processed_df.write.format("delta").mode("append").save(delta_path)

        print(f"SUCCESS: {processed_df.count()} clinical records committed to Delta Lake.")
        processed_df.select("timestamp", "patient_id", "status").show()

except Exception as e:
    print(f"Engine Alert: {e}")

print("--- ENGINE READY ---")